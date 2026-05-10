import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { deletePhoto } from '../lib/photoDelete'

const COLORS = {
  background: '#FAFAF7',
  accent: '#8B7355',
  text: '#2C2C2C',
  subtext: '#9E9E9E',
  border: '#E0D9D0',
  followUpBg: '#F0EDE8',
  danger: '#C0392B',
}

const ITEM_SIZE = (Dimensions.get('window').width - 48) / 2

type MessageEntry = {
  id: string
  content: string
  is_original: boolean
  created_at: string
}

type PhotoItem = {
  id: string
  image_url: string
  taken_at: string
  messages: MessageEntry[]
  isUnlocked: boolean
}

type Props = {
  albumId: string
  emptyText?: string
  showMoveAction?: boolean
}

export default function AlbumDetailView({ albumId, emptyText, showMoveAction }: Props) {
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<PhotoItem | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [appendText, setAppendText] = useState('')
  const [appendSaving, setAppendSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [showAlbumPicker, setShowAlbumPicker] = useState(false)
  const [availableAlbums, setAvailableAlbums] = useState<{ id: string; title: string }[]>([])
  const [loadingAlbums, setLoadingAlbums] = useState(false)
  const [newAlbumName, setNewAlbumName] = useState('')
  const [showNewAlbum, setShowNewAlbum] = useState(false)
  const [moving, setMoving] = useState(false)

  const fetchPhotos = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)

    const { data: photoData } = await supabase
      .from('photos')
      .select('id, image_url, taken_at')
      .eq('album_id', albumId)
      .order('taken_at', { ascending: false })

    if (!photoData?.length) { setPhotos([]); return }

    const photoIds = photoData.map(p => p.id)

    const [{ data: unlockData }, { data: msgData }] = await Promise.all([
      supabase
        .from('unlock_records')
        .select('photo_id')
        .eq('user_id', user.id)
        .in('photo_id', photoIds),
      supabase
        .from('messages')
        .select('id, photo_id, content, is_original, created_at')
        .in('photo_id', photoIds)
        .order('created_at', { ascending: true }),
    ])

    const unlockedSet = new Set((unlockData ?? []).map(u => u.photo_id as string))

    const msgMap: Record<string, MessageEntry[]> = {}
    for (const m of (msgData ?? [])) {
      if (!msgMap[m.photo_id]) msgMap[m.photo_id] = []
      msgMap[m.photo_id].push({
        id: m.id,
        content: m.content,
        is_original: m.is_original,
        created_at: m.created_at,
      })
    }

    setPhotos(photoData.map(p => ({
      id: p.id,
      image_url: p.image_url,
      taken_at: p.taken_at,
      messages: msgMap[p.id] ?? [],
      isUnlocked: unlockedSet.has(p.id),
    })))
  }, [albumId])

  const isFirstLoad = useRef(true)

  useFocusEffect(
    useCallback(() => {
      if (isFirstLoad.current) {
        fetchPhotos().finally(() => { setLoading(false); isFirstLoad.current = false })
      } else {
        fetchPhotos()
      }
    }, [fetchPhotos])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchPhotos()
    setRefreshing(false)
  }, [fetchPhotos])

  const handleCloseModal = () => {
    setSelected(null)
    setAppendText('')
  }

  const openAlbumPicker = async () => {
    setShowNewAlbum(false)
    setNewAlbumName('')
    setLoadingAlbums(true)
    setShowAlbumPicker(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoadingAlbums(false); return }
    const { data } = await supabase
      .from('albums')
      .select('id, title')
      .eq('user_id', user.id)
      .eq('is_desk', false)
      .order('created_at', { ascending: false })
    setAvailableAlbums(data ?? [])
    setLoadingAlbums(false)
  }

  const handleMoveToAlbum = async (targetAlbumId: string | null) => {
    if (!selected) return
    setMoving(true)
    try {
      let finalAlbumId = targetAlbumId

      if (targetAlbumId === null) {
        if (!newAlbumName.trim()) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
          .from('albums')
          .insert({ title: newAlbumName.trim(), user_id: user.id })
          .select('id')
          .single()
        if (!data) throw new Error('アルバムの作成に失敗しました')
        finalAlbumId = data.id
      }

      const { error } = await supabase
        .from('photos')
        .update({ album_id: finalAlbumId })
        .eq('id', selected.id)
      if (error) throw error

      setPhotos(prev => prev.filter(p => p.id !== selected.id))
      setShowAlbumPicker(false)
      handleCloseModal()
    } catch (e) {
      console.error('movePhoto error:', e)
      Alert.alert('エラー', '移動に失敗しました。もう一度お試しください。')
    } finally {
      setMoving(false)
    }
  }

  const handleDelete = () => {
    if (!selected) return
    Alert.alert(
      'この写真を削除しますか？',
      'メッセージも含めて完全に削除されます。この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true)
            try {
              await deletePhoto(selected.id, selected.image_url)
              setPhotos(prev => prev.filter(p => p.id !== selected.id))
              handleCloseModal()
            } catch (e) {
              console.error('deletePhoto error:', e)
              Alert.alert('エラー', '削除に失敗しました。もう一度お試しください。')
            } finally {
              setDeleting(false)
            }
          },
        },
      ]
    )
  }

  const handleAppend = async () => {
    if (!appendText.trim() || !selected || !currentUserId) return
    setAppendSaving(true)
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          photo_id: selected.id,
          content: appendText.trim(),
          author_id: currentUserId,
          is_original: false,
        })
        .select('id, content, is_original, created_at')
        .single()
      if (error) throw error

      const newMsg = data as MessageEntry
      const updatedSelected = { ...selected, messages: [...selected.messages, newMsg] }
      setSelected(updatedSelected)
      setPhotos(prev => prev.map(p => p.id === selected.id ? updatedSelected : p))
      setAppendText('')
    } finally {
      setAppendSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    )
  }

  const originalMsg = selected?.messages.find(m => m.is_original)
  const followUpMsgs = selected?.messages.filter(m => !m.is_original) ?? []

  return (
    <View style={styles.container}>
      {photos.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {emptyText ?? 'このアルバムに写真はありません'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={item => item.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
          }
          renderItem={({ item }) => {
            const original = item.messages.find(m => m.is_original)
            return (
              <TouchableOpacity style={styles.card} onPress={() => setSelected(item)} activeOpacity={0.85}>
                <Image source={{ uri: item.image_url }} style={styles.thumbnail} resizeMode="cover" />
                {item.isUnlocked ? (
                  original ? (
                    <View style={styles.cardBody}>
                      <Text style={styles.messagePreview} numberOfLines={2}>{original.content}</Text>
                    </View>
                  ) : null
                ) : (
                  <View style={styles.cardLock}>
                    <Text style={styles.lockIcon}>🔒</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          }}
        />
      )}

      <Modal
        visible={selected !== null}
        animationType="fade"
        transparent
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.overlay} onPress={handleCloseModal}>
            <Pressable style={styles.modal}>
              {selected && (
                <>
                  <Image source={{ uri: selected.image_url }} style={styles.modalImage} resizeMode="cover" />

                  {selected.isUnlocked ? (
                    <ScrollView
                      style={styles.modalScrollContent}
                      bounces={false}
                      keyboardShouldPersistTaps="handled"
                    >
                      {originalMsg && (
                        <View style={styles.modalSection}>
                          <Text style={styles.sectionLabel}>思い出のメッセージ</Text>
                          <Text style={styles.modalMessage}>{originalMsg.content}</Text>
                        </View>
                      )}

                      {followUpMsgs.length > 0 && (
                        <View style={styles.modalSection}>
                          <Text style={styles.sectionLabel}>追記</Text>
                          {followUpMsgs.map(fu => (
                            <View key={fu.id} style={styles.followUpItem}>
                              <Text style={styles.followUpContent}>{fu.content}</Text>
                              <Text style={styles.followUpDate}>
                                {new Date(fu.created_at).toLocaleDateString('ja-JP', {
                                  year: 'numeric', month: 'long', day: 'numeric',
                                })}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      <View style={styles.appendSection}>
                        <Text style={styles.sectionLabel}>追記する</Text>
                        <TextInput
                          style={styles.appendInput}
                          value={appendText}
                          onChangeText={setAppendText}
                          placeholder="今の気持ちを書き留めておく…"
                          placeholderTextColor={COLORS.subtext}
                          multiline
                          textAlignVertical="top"
                        />
                        <TouchableOpacity
                          style={[styles.appendButton, (!appendText.trim() || appendSaving) && styles.buttonDisabled]}
                          onPress={handleAppend}
                          disabled={!appendText.trim() || appendSaving}
                        >
                          {appendSaving
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <Text style={styles.appendButtonText}>追記を保存する</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    </ScrollView>
                  ) : (
                    <View style={styles.lockedContent}>
                      <Text style={styles.lockIconLarge}>🔒</Text>
                      <Text style={styles.lockedHint}>
                        この場所へ戻り同じ風景を撮影すると{'\n'}メッセージが解除されます
                      </Text>
                    </View>
                  )}

                  <View style={styles.modalFooter}>
                    <Text style={styles.modalDate}>
                      {new Date(selected.taken_at).toLocaleDateString('ja-JP', {
                        year: 'numeric', month: 'long', day: 'numeric',
                      })}
                    </Text>
                    <View style={styles.footerActions}>
                      {showMoveAction && (
                        <TouchableOpacity onPress={openAlbumPicker} style={styles.moveButton}>
                          <Text style={styles.moveText}>アルバムに移動</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={handleDelete} disabled={deleting}>
                        {deleting
                          ? <ActivityIndicator size="small" color={COLORS.danger} />
                          : <Text style={styles.deleteText}>削除</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={showAlbumPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAlbumPicker(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setShowAlbumPicker(false)}>
          <Pressable style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>移動先のアルバム</Text>

            {loadingAlbums ? (
              <ActivityIndicator color={COLORS.accent} style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled">
                {availableAlbums.map(album => (
                  <TouchableOpacity
                    key={album.id}
                    style={styles.pickerRow}
                    onPress={() => handleMoveToAlbum(album.id)}
                    disabled={moving}
                  >
                    <Text style={styles.pickerRowText}>{album.title}</Text>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={[styles.pickerRow, showNewAlbum && styles.pickerRowSelected]}
                  onPress={() => setShowNewAlbum(v => !v)}
                  disabled={moving}
                >
                  <Text style={styles.pickerRowText}>＋ 新しいアルバムを作成</Text>
                </TouchableOpacity>

                {showNewAlbum && (
                  <View style={styles.newAlbumRow}>
                    <TextInput
                      style={styles.newAlbumInput}
                      placeholder="アルバム名"
                      placeholderTextColor={COLORS.subtext}
                      value={newAlbumName}
                      onChangeText={setNewAlbumName}
                      autoFocus
                    />
                    <TouchableOpacity
                      style={[styles.newAlbumConfirm, (!newAlbumName.trim() || moving) && styles.buttonDisabled]}
                      onPress={() => handleMoveToAlbum(null)}
                      disabled={!newAlbumName.trim() || moving}
                    >
                      {moving
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.newAlbumConfirmText}>作成して移動</Text>
                      }
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: 15, color: COLORS.subtext, textAlign: 'center' },
  grid: { padding: 16 },
  row: { justifyContent: 'space-between', marginBottom: 16 },
  card: {
    width: ITEM_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  thumbnail: { width: '100%', height: ITEM_SIZE },
  cardBody: { padding: 8 },
  messagePreview: { fontSize: 12, color: COLORS.text, lineHeight: 18 },
  cardLock: { paddingVertical: 6, paddingHorizontal: 8 },
  lockIcon: { fontSize: 14 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modal: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    maxHeight: '88%',
  },
  modalImage: { width: '100%', height: 220 },
  modalScrollContent: { maxHeight: 320 },
  modalSection: { padding: 16, gap: 6 },
  sectionLabel: {
    fontSize: 11,
    color: COLORS.subtext,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  modalMessage: { fontSize: 15, color: COLORS.text, lineHeight: 24 },
  followUpItem: {
    backgroundColor: COLORS.followUpBg,
    borderRadius: 8,
    padding: 10,
    gap: 4,
    marginTop: 8,
  },
  followUpContent: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  followUpDate: { fontSize: 11, color: COLORS.subtext },
  appendSection: {
    padding: 16,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  appendInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: COLORS.text,
    minHeight: 80,
    backgroundColor: '#fff',
  },
  appendButton: {
    backgroundColor: COLORS.accent,
    paddingVertical: 11,
    borderRadius: 4,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  appendButtonText: { color: '#fff', fontSize: 13, letterSpacing: 1 },
  lockedContent: {
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
  },
  lockIconLarge: { fontSize: 30 },
  lockedHint: {
    fontSize: 13,
    color: COLORS.subtext,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalDate: { fontSize: 12, color: COLORS.subtext },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  moveButton: {},
  moveText: { fontSize: 13, color: COLORS.accent },
  deleteText: { fontSize: 13, color: COLORS.danger },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
    maxHeight: '60%',
  },
  pickerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  pickerRow: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  pickerRowSelected: { backgroundColor: '#F5EFE6' },
  pickerRowText: { fontSize: 15, color: COLORS.text },
  newAlbumRow: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  newAlbumInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
  },
  newAlbumConfirm: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  newAlbumConfirmText: { color: '#fff', fontSize: 14 },
})
