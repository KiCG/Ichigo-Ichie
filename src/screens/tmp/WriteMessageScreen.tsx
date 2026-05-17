import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import TextEditorModal from '../../components/TextEditorModal'
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import * as MediaLibrary from 'expo-media-library'
import { supabase } from '../../lib/supabase'
import { getCameraRollPreference } from '../../lib/cameraRollPreference'
import { COLORS, FONTS, SPACING, TYPE, RADIUS } from '../../theme'
import type { Album, MemoriesStackParamList } from '../../types'

type WriteMessageRoute = RouteProp<MemoriesStackParamList, 'WriteMessage'>
type WriteMessageNav = NativeStackNavigationProp<MemoriesStackParamList, 'WriteMessage'>

export default function WriteMessageScreen() {
  const route = useRoute<WriteMessageRoute>()
  const navigation = useNavigation<WriteMessageNav>()
  const { photoId, imageUrl } = route.params

  const [message, setMessage] = useState('')
  const [albums, setAlbums] = useState<Album[]>([])
  const [sharedAlbums, setSharedAlbums] = useState<{ id: string; title: string }[]>([])
  const [deskAlbumId, setDeskAlbumId] = useState<string | null>(null)
  const [useDeskAlbum, setUseDeskAlbum] = useState(true)
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null)
  const [showNewAlbum, setShowNewAlbum] = useState(false)
  const [newAlbumName, setNewAlbumName] = useState('')
  const [loadingAlbums, setLoadingAlbums] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [useCapsule, setUseCapsule] = useState(false)
  const [notifyShared, setNotifyShared] = useState(false)
  const [unlockAt, setUnlockAt] = useState<Date>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    d.setHours(9, 0, 0, 0)
    return d
  })
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showPhotoFull, setShowPhotoFull] = useState(false)

  useEffect(() => {
    fetchAlbums()
  }, [])

  const fetchAlbums = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let { data: desk } = await supabase
        .from('albums')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_desk', true)
        .single()

      if (!desk) {
        const { data: created } = await supabase
          .from('albums')
          .insert({ title: '机', user_id: user.id, is_desk: true })
          .select('id')
          .single()
        desk = created
      }
      setDeskAlbumId(desk?.id ?? null)

      const { data: normalAlbums } = await supabase
        .from('albums')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_desk', false)
        .order('created_at', { ascending: false })

      setAlbums(normalAlbums ?? [])

      const { data: shareData } = await supabase
        .from('album_shares')
        .select('albums(id, title)')
        .eq('shared_to_user_id', user.id)
        .eq('can_add_photos', true)
      setSharedAlbums(
        (shareData ?? [])
          .map(s => s.albums as unknown as { id: string; title: string } | null)
          .filter((a): a is { id: string; title: string } => a !== null)
      )
    } catch (e) {
      console.error('fetchAlbums error:', e)
    } finally {
      setLoadingAlbums(false)
    }
  }

  const createAlbum = async (userId: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from('albums')
      .insert({ title: newAlbumName.trim(), user_id: userId })
      .select()
      .single()
    if (error || !data) return null
    return data.id
  }

  const handleSave = async () => {
    if (!message.trim()) {
      setError('メッセージを入力してください')
      return
    }
    if (showNewAlbum && !newAlbumName.trim()) {
      setError('アルバム名を入力してください')
      return
    }

    setError('')
    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ログインが必要です')

      let albumId: string | null = null
      if (useDeskAlbum) {
        albumId = deskAlbumId
        if (!albumId) throw new Error('机アルバムが見つかりません')
      } else if (showNewAlbum) {
        albumId = await createAlbum(user.id)
        if (!albumId) throw new Error('アルバムの作成に失敗しました')
      } else {
        albumId = selectedAlbumId
        if (!albumId) throw new Error('アルバムを選択してください')
      }

      const { error: updateError } = await supabase
        .from('photos')
        .update({
          album_id: albumId,
          unlock_at: useCapsule ? unlockAt.toISOString() : null,
          notify_shared: useCapsule ? notifyShared : false,
        })
        .eq('id', photoId)
      if (updateError) throw updateError

      const { error: msgError } = await supabase.from('messages').insert({
        photo_id: photoId,
        content: message.trim(),
        author_id: user.id,
        is_original: true,
      })
      if (msgError) throw msgError

      const pref = await getCameraRollPreference()
      if (pref === 'message_only') {
        const { status } = await MediaLibrary.requestPermissionsAsync()
        if (status === 'granted') await MediaLibrary.saveToLibraryAsync(imageUrl)
      }

      navigation.goBack()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '保存中にエラーが発生しました'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const selectDesk = () => {
    setUseDeskAlbum(true)
    setSelectedAlbumId(null)
    setShowNewAlbum(false)
  }

  const selectAlbum = (id: string) => {
    setUseDeskAlbum(false)
    setSelectedAlbumId(id)
    setShowNewAlbum(false)
  }

  const selectNewAlbum = () => {
    setUseDeskAlbum(false)
    setSelectedAlbumId(null)
    setShowNewAlbum(true)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <TouchableOpacity activeOpacity={0.9} onPress={() => setShowPhotoFull(true)}>
          <Image source={{ uri: imageUrl }} style={styles.photo} resizeMode="cover" />
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.label}>思い出を綴る</Text>
          <TouchableOpacity
            style={styles.messageInput}
            onPress={() => setShowEditor(true)}
            activeOpacity={0.7}
          >
            {message ? (
              <Text style={styles.messagePreview}>{message}</Text>
            ) : (
              <Text style={styles.messagePlaceholder}>この場所での思いを残しましょう…</Text>
            )}
            <View style={styles.pencilWrap}>
              <Ionicons name="pencil-outline" size={13} color={COLORS.inkSoft} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>タイムカプセル</Text>
          <View style={styles.capsuleRow}>
            <View style={styles.capsuleTextWrap}>
              <Text style={styles.capsuleTitle}>指定日に封印する</Text>
              <Text style={styles.capsuleSub}>その日の朝9時に通知が届きます</Text>
            </View>
            <Switch
              value={useCapsule}
              onValueChange={setUseCapsule}
              trackColor={{ false: COLORS.rule, true: COLORS.accent }}
              thumbColor={COLORS.white}
            />
          </View>
          {useCapsule && (
            <>
              <TouchableOpacity
                style={styles.datePicker}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={16} color={COLORS.accent} />
                <Text style={styles.datePickerText}>
                  {unlockAt.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={COLORS.inkSoft} />
              </TouchableOpacity>
              <View style={styles.capsuleRow}>
                <View style={styles.capsuleTextWrap}>
                  <Text style={styles.capsuleTitle}>共有先にも通知する</Text>
                  <Text style={styles.capsuleSub}>
                    アルバムを共有している場合、相手にも開封通知が届きます
                  </Text>
                </View>
                <Switch
                  value={notifyShared}
                  onValueChange={setNotifyShared}
                  trackColor={{ false: COLORS.rule, true: COLORS.accent }}
                  thumbColor={COLORS.white}
                />
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>どこに置く？</Text>
          {loadingAlbums ? (
            <ActivityIndicator color={COLORS.accent} style={{ marginTop: SPACING.sm }} />
          ) : (
            <>
              <TouchableOpacity
                style={[styles.albumRow, styles.deskRow, useDeskAlbum && styles.deskRowSelected]}
                onPress={selectDesk}
                activeOpacity={0.7}
              >
                <Text style={[styles.albumRowText, styles.deskRowText]}>机の上に置く</Text>
                <Text style={styles.deskRowSub}>後でアルバムに整理できます</Text>
              </TouchableOpacity>

              {albums.map(album => (
                <TouchableOpacity
                  key={album.id}
                  style={[
                    styles.albumRow,
                    !useDeskAlbum && selectedAlbumId === album.id && !showNewAlbum && styles.albumRowSelected,
                  ]}
                  onPress={() => selectAlbum(album.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.albumRowText}>{album.title}</Text>
                </TouchableOpacity>
              ))}

              {sharedAlbums.map(album => (
                <TouchableOpacity
                  key={album.id}
                  style={[
                    styles.albumRow,
                    !useDeskAlbum && selectedAlbumId === album.id && !showNewAlbum && styles.albumRowSelected,
                  ]}
                  onPress={() => selectAlbum(album.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.sharedAlbumRow}>
                    <Text style={styles.albumRowText}>{album.title}</Text>
                    <View style={styles.sealBadge}>
                      <Text style={styles.sealBadgeText}>共</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[styles.albumRow, !useDeskAlbum && showNewAlbum && styles.albumRowSelected]}
                onPress={selectNewAlbum}
                activeOpacity={0.7}
              >
                <Text style={styles.albumRowText}>＋ 新しいアルバムをつくる</Text>
              </TouchableOpacity>

              {showNewAlbum && (
                <TextInput
                  style={styles.albumNameInput}
                  placeholder="アルバム名"
                  placeholderTextColor={COLORS.inkSoft}
                  value={newAlbumName}
                  onChangeText={setNewAlbumName}
                  autoFocus
                />
              )}
            </>
          )}
        </View>

        {error !== '' && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.saveButtonText}>思い出を残す</Text>
          }
        </TouchableOpacity>

      </ScrollView>

      <Modal visible={showPhotoFull} transparent animationType="fade" onRequestClose={() => setShowPhotoFull(false)}>
        <Pressable style={styles.photoFullScreen} onPress={() => setShowPhotoFull(false)}>
          <Image
            source={{ uri: imageUrl }}
            style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height }}
            resizeMode="contain"
          />
          <TouchableOpacity style={styles.photoFullCloseBtn} onPress={() => setShowPhotoFull(false)}>
            <Ionicons name="close" size={26} color={COLORS.paper} />
          </TouchableOpacity>
        </Pressable>
      </Modal>

      {/* iOS: sheet modal / Android: inline */}
      {Platform.OS === 'ios' ? (
        <Modal visible={showDatePicker} animationType="slide" transparent onRequestClose={() => setShowDatePicker(false)}>
          <Pressable style={styles.dateOverlay} onPress={() => setShowDatePicker(false)}>
            <Pressable style={styles.dateSheet}>
              <View style={styles.dateSheetHeader}>
                <Text style={styles.dateSheetTitle}>封印を解く日</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.dateSheetDone}>完了</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={unlockAt}
                mode="date"
                display="spinner"
                minimumDate={new Date(Date.now() + 24 * 60 * 60 * 1000)}
                locale="ja-JP"
                onChange={(_, date) => { if (date) setUnlockAt(date) }}
                style={{ height: 200 }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : (
        showDatePicker && (
          <DateTimePicker
            value={unlockAt}
            mode="date"
            display="default"
            minimumDate={new Date(Date.now() + 24 * 60 * 60 * 1000)}
            onChange={(_, date) => { setShowDatePicker(false); if (date) setUnlockAt(date) }}
          />
        )
      )}

      <TextEditorModal
        visible={showEditor}
        title="思い出を綴る"
        placeholder="この場所での思いを残しましょう…"
        initialValue={message}
        onSave={(text) => { setMessage(text); setShowEditor(false) }}
        onCancel={() => setShowEditor(false)}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.paper },
  scroll: { paddingBottom: SPACING.huge },
  photo: { width: '100%', height: 320, backgroundColor: COLORS.paperDeep },

  section: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xxl },
  label: {
    ...TYPE.meta,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  messageInput: {
    minHeight: 140,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
    borderRadius: RADIUS.thumb,
    padding: SPACING.md,
    backgroundColor: COLORS.white,
  },
  messagePreview: {
    fontFamily: FONTS.serif,
    fontSize: 16,
    color: COLORS.ink,
    lineHeight: 28,
  },
  messagePlaceholder: {
    fontFamily: FONTS.serif,
    fontSize: 16,
    color: COLORS.inkSoft,
    fontStyle: 'italic',
    lineHeight: 28,
  },
  pencilWrap: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
  },

  albumRow: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
    borderRadius: RADIUS.thumb,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.white,
  },
  albumRowSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.paperDeep,
  },
  albumRowText: {
    fontFamily: FONTS.serif,
    fontSize: 15,
    color: COLORS.ink,
  },
  deskRow: {
    borderColor: COLORS.rule,
    backgroundColor: COLORS.paperDeep,
  },
  deskRowSelected: {
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  deskRowText: { fontFamily: FONTS.serif, fontWeight: '500' },
  deskRowSub: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: COLORS.inkSoft,
    marginTop: SPACING.xs,
  },
  albumNameInput: {
    height: 46,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.thumb,
    paddingHorizontal: SPACING.md,
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.ink,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.sm,
  },
  error: {
    color: COLORS.danger,
    fontFamily: FONTS.sans,
    fontSize: 13,
    marginTop: SPACING.md,
    marginHorizontal: SPACING.xl,
    textAlign: 'center',
  },
  saveButton: {
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.xxl,
    height: 50,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.thumb,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: {
    color: COLORS.white,
    fontFamily: FONTS.sans,
    fontSize: 15,
    letterSpacing: 1,
  },

  capsuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  capsuleTextWrap: { flex: 1, paddingRight: SPACING.md },
  capsuleTitle: {
    fontFamily: FONTS.serif,
    fontSize: 15,
    color: COLORS.ink,
  },
  capsuleSub: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: COLORS.inkSoft,
    marginTop: 2,
  },
  datePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLORS.white,
    marginTop: SPACING.xs,
  },
  datePickerText: {
    flex: 1,
    fontFamily: FONTS.serif,
    fontSize: 15,
    color: COLORS.ink,
  },

  dateOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(44,38,32,0.4)',
  },
  dateSheet: {
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
  },
  dateSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  dateSheetTitle: {
    fontFamily: FONTS.serif,
    fontSize: 16,
    color: COLORS.ink,
  },
  dateSheetDone: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.accent,
  },

  photoFullScreen: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFullCloseBtn: {
    position: 'absolute',
    top: SPACING.xxl + 16,
    right: SPACING.xl,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: SPACING.sm,
  },

  sharedAlbumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sealBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.seal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealBadgeText: {
    fontFamily: FONTS.serif,
    fontSize: 11,
    color: COLORS.paper,
  },
})
