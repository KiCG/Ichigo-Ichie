import React, { useState, useEffect, useCallback } from 'react'
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
}

export default function AlbumDetailView({ albumId, emptyText }: Props) {
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<PhotoItem | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [appendText, setAppendText] = useState('')
  const [appendSaving, setAppendSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  useEffect(() => {
    fetchPhotos().finally(() => setLoading(false))
  }, [fetchPhotos])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchPhotos()
    setRefreshing(false)
  }, [fetchPhotos])

  const handleCloseModal = () => {
    setSelected(null)
    setAppendText('')
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
                    <TouchableOpacity onPress={handleDelete} disabled={deleting}>
                      {deleting
                        ? <ActivityIndicator size="small" color={COLORS.danger} />
                        : <Text style={styles.deleteText}>削除</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
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
  deleteText: { fontSize: 13, color: COLORS.danger },
})
