import React, { useState, useCallback, useRef } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
} from 'react-native'
// TextInput は album picker の newAlbumInput で引き続き使用
import { Ionicons } from '@expo/vector-icons'
import TextEditorModal from './TextEditorModal'
import { supabase } from '../lib/supabase'
import { deletePhoto } from '../lib/photoDelete'
import { COLORS, FONTS, SPACING, TYPE, RADIUS } from '../theme'

const SCREEN_WIDTH = Dimensions.get('window').width
const SCREEN_HEIGHT = Dimensions.get('window').height
const UNLOCK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const FRESH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000
const COLLAPSE_THRESHOLD = 60

type MessageEntry = {
  id: string
  content: string
  is_original: boolean
  created_at: string
  unlock_record_id: string | null
}

type UnlockEntry = {
  unlockRecordId: string
  unlockedAt: string
  isActive: boolean
  message: MessageEntry | null
  memoryImageUrl: string | null
}

type SharedEntry = {
  unlockRecordId: string
  unlockedAt: string
  message: MessageEntry | null
}

type PhotoItem = {
  id: string
  image_url: string
  taken_at: string
  user_id: string
  unlock_at: string | null
  originalMessage: MessageEntry | null
  isSealed: boolean
  isUnlocked: boolean
  isFresh: boolean
  unlockEntries: UnlockEntry[]
  currentUnlockRecordId: string | null
  othersEntries: SharedEntry[]
}

type Props = {
  albumId: string
  emptyText?: string
  showMoveAction?: boolean
  initialPhotoId?: string
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function AlbumDetailView({ albumId, emptyText, showMoveAction, initialPhotoId }: Props) {
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<PhotoItem | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [canMessage, setCanMessage] = useState(false)
  const [appendText, setAppendText] = useState('')
  const [appendSaving, setAppendSaving] = useState(false)
  const [originalEditText, setOriginalEditText] = useState('')
  const [originalSaving, setOriginalSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editorTarget, setEditorTarget] = useState<'original' | 'followup' | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [showPhotoFull, setShowPhotoFull] = useState(false)

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
      .select('id, image_url, taken_at, user_id, unlock_at')
      .eq('album_id', albumId)
      .order('taken_at', { ascending: false })

    if (!photoData?.length) {
      setPhotos([])
      setCanMessage(false)
      return
    }

    const photoIds = photoData.map(p => p.id)

    const { data: myShare } = await supabase
      .from('album_shares')
      .select('can_message')
      .eq('album_id', albumId)
      .eq('shared_to_user_id', user.id)
      .maybeSingle()

    let canMsgFlag = false
    if (myShare) {
      canMsgFlag = myShare.can_message
    } else {
      const { data: ownerShare } = await supabase
        .from('album_shares')
        .select('id')
        .eq('album_id', albumId)
        .eq('can_message', true)
        .not('shared_to_user_id', 'is', null)
        .limit(1)
      canMsgFlag = (ownerShare?.length ?? 0) > 0
    }
    setCanMessage(canMsgFlag)

    const unlockBase = supabase
      .from('unlock_records')
      .select('id, photo_id, unlocked_at, user_id, memory_image_url')
      .in('photo_id', photoIds)
      .order('unlocked_at', { ascending: true })

    const [{ data: unlockData }, { data: msgData }] = await Promise.all([
      canMsgFlag ? unlockBase : unlockBase.eq('user_id', user.id),
      supabase
        .from('messages')
        .select('id, photo_id, content, is_original, created_at, unlock_record_id')
        .in('photo_id', photoIds)
        .order('created_at', { ascending: true }),
    ])

    const now = Date.now()

    const originalMsgMap: Record<string, MessageEntry> = {}
    const followUpByUnlockRecord: Record<string, MessageEntry> = {}
    for (const m of msgData ?? []) {
      const entry: MessageEntry = {
        id: m.id,
        content: m.content,
        is_original: m.is_original,
        created_at: m.created_at,
        unlock_record_id: m.unlock_record_id ?? null,
      }
      if (m.is_original) {
        originalMsgMap[m.photo_id] = entry
      } else if (m.unlock_record_id) {
        followUpByUnlockRecord[m.unlock_record_id] = entry
      }
    }

    const ownEntriesMap: Record<string, UnlockEntry[]> = {}
    const othersEntriesMap: Record<string, SharedEntry[]> = {}
    for (const u of unlockData ?? []) {
      const msg = followUpByUnlockRecord[u.id] ?? null
      if (u.user_id === user.id) {
        if (!ownEntriesMap[u.photo_id]) ownEntriesMap[u.photo_id] = []
        ownEntriesMap[u.photo_id].push({
          unlockRecordId: u.id,
          unlockedAt: u.unlocked_at,
          isActive: now - new Date(u.unlocked_at).getTime() <= UNLOCK_WINDOW_MS,
          message: msg,
          memoryImageUrl: u.memory_image_url ?? null,
        })
      } else {
        if (!othersEntriesMap[u.photo_id]) othersEntriesMap[u.photo_id] = []
        othersEntriesMap[u.photo_id].push({
          unlockRecordId: u.id,
          unlockedAt: u.unlocked_at,
          message: msg,
        })
      }
    }

    const processed = photoData.map(p => {
      const entries = ownEntriesMap[p.id] ?? []
      const activeEntry = entries.find(e => e.isActive) ?? null
      const isFresh = p.user_id === user.id && now - new Date(p.taken_at).getTime() <= FRESH_WINDOW_MS
      const isSealed = !!p.unlock_at && new Date(p.unlock_at).getTime() > now
      return {
        id: p.id,
        image_url: p.image_url,
        taken_at: p.taken_at,
        user_id: p.user_id,
        unlock_at: p.unlock_at ?? null,
        originalMessage: originalMsgMap[p.id] ?? null,
        isSealed,
        isUnlocked: !isSealed && (!!activeEntry || isFresh),
        isFresh,
        unlockEntries: entries,
        currentUnlockRecordId: activeEntry?.unlockRecordId ?? null,
        othersEntries: othersEntriesMap[p.id] ?? [],
      }
    })
    setPhotos(processed)

    if (initialPhotoId && !autoSelectDone.current) {
      const target = processed.find(p => p.id === initialPhotoId)
      if (target) {
        autoSelectDone.current = true
        const activeEntry = target.unlockEntries.find(e => e.isActive)
        setSelected(target)
        setAppendText(activeEntry?.message?.content ?? '')
        setOriginalEditText(target.originalMessage?.content ?? '')
      }
    }
  }, [albumId, initialPhotoId])

  const isFirstLoad = useRef(true)
  const autoSelectDone = useRef(false)

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

  const handleSelectPhoto = (item: PhotoItem) => {
    const activeEntry = item.unlockEntries.find(e => e.isActive)
    setAppendText(activeEntry?.message?.content ?? '')
    setOriginalEditText(item.originalMessage?.content ?? '')
    setSelected(item)
  }

  const handleCloseModal = () => {
    setSelected(null)
    setAppendText('')
    setOriginalEditText('')
    setShowAlbumPicker(false)
    setNewAlbumName('')
    setShowNewAlbum(false)
    setShowPhotoFull(false)
  }

  const handleSaveOriginal = async () => {
    if (!originalEditText.trim() || !selected || !currentUserId) return
    setOriginalSaving(true)
    try {
      if (selected.originalMessage) {
        const { data, error } = await supabase
          .from('messages')
          .update({ content: originalEditText.trim() })
          .eq('id', selected.originalMessage.id)
          .select('id, content, is_original, created_at, unlock_record_id')
          .single()
        if (error) throw error
        const updatedSelected = {
          ...selected,
          originalMessage: { ...data, unlock_record_id: data.unlock_record_id ?? null },
        }
        setSelected(updatedSelected)
        setPhotos(prev => prev.map(p => p.id === selected.id ? updatedSelected : p))
      }
    } catch {
      Alert.alert('エラー', '保存に失敗しました。もう一度お試しください。')
    } finally {
      setOriginalSaving(false)
    }
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
      .neq('id', albumId)
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
    } catch {
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
            } catch {
              Alert.alert('エラー', '削除に失敗しました。もう一度お試しください。')
            } finally {
              setDeleting(false)
            }
          },
        },
      ]
    )
  }

  const handleSaveFollowUp = async () => {
    if (!appendText.trim() || !selected || !currentUserId || !selected.currentUnlockRecordId) return
    setAppendSaving(true)
    try {
      const activeEntry = selected.unlockEntries.find(e => e.isActive)
      const existingMsg = activeEntry?.message ?? null

      let savedMsg: MessageEntry
      if (existingMsg) {
        const { data, error } = await supabase
          .from('messages')
          .update({ content: appendText.trim() })
          .eq('id', existingMsg.id)
          .select('id, content, is_original, created_at, unlock_record_id')
          .single()
        if (error) throw error
        savedMsg = { ...data, unlock_record_id: data.unlock_record_id ?? null }
      } else {
        const { data, error } = await supabase
          .from('messages')
          .insert({
            photo_id: selected.id,
            content: appendText.trim(),
            author_id: currentUserId,
            is_original: false,
            unlock_record_id: selected.currentUnlockRecordId,
          })
          .select('id, content, is_original, created_at, unlock_record_id')
          .single()
        if (error) throw error
        savedMsg = { ...data, unlock_record_id: data.unlock_record_id ?? null }
      }

      const updatedEntries = selected.unlockEntries.map(e =>
        e.isActive ? { ...e, message: savedMsg } : e
      )
      const updatedSelected = { ...selected, unlockEntries: updatedEntries }
      setSelected(updatedSelected)
      setPhotos(prev => prev.map(p => p.id === selected.id ? updatedSelected : p))
    } finally {
      setAppendSaving(false)
    }
  }

  const isOwnPhoto = selected?.user_id === currentUserId

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {photos.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {emptyText ?? 'このアルバムに写真はありません'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.journal}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
          }
        >
          {photos.map((item, idx) => (
            <View key={item.id} style={[styles.entry, idx === 0 && styles.entryFirst]}>
              <Text style={styles.entryDate}>{formatDate(item.taken_at)}</Text>

              <TouchableOpacity
                onPress={() => handleSelectPhoto(item)}
                activeOpacity={0.92}
              >
                <Image source={{ uri: item.image_url }} style={styles.entryImage} resizeMode="cover" />
                {item.isSealed && (
                  <View style={styles.lockOverlay}>
                    <Ionicons name="lock-closed" size={20} color={COLORS.paper} style={{ marginBottom: 6 }} />
                    <Text style={styles.lockText}>
                      {new Date(item.unlock_at!).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
                    </Text>
                  </View>
                )}
                {!item.isSealed && !item.isUnlocked && (
                  <View style={styles.lockOverlay}>
                    <Text style={styles.lockText}>未解錠</Text>
                  </View>
                )}
              </TouchableOpacity>

              {item.isUnlocked && item.originalMessage && (() => {
                const content = item.originalMessage.content
                const isLong = content.length > COLLAPSE_THRESHOLD
                const isExpanded = expandedIds.has(item.id)
                return (
                  <>
                    <View style={styles.messageWrap}>
                      <Text style={styles.quoteOpen}>「</Text>
                      <Text style={styles.messageBody} numberOfLines={isLong && !isExpanded ? 4 : undefined}>
                        {content}
                      </Text>
                      <Text style={styles.quoteClose}>」</Text>
                    </View>
                    {isLong && (
                      <TouchableOpacity onPress={() => toggleExpanded(item.id)} activeOpacity={0.7} style={styles.expandBtn}>
                        <Text style={styles.expandBtnText}>{isExpanded ? '閉じる' : '続きを読む'}</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )
              })()}

              {item.isSealed && (
                <Text style={styles.lockedHint}>
                  {new Date(item.unlock_at!).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}に解錠できます
                </Text>
              )}

              {!item.isSealed && !item.isUnlocked && (
                <Text style={styles.lockedHint}>
                  この場所へ戻り、同じ風景を撮影するとメッセージが現れます
                </Text>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <Modal
        visible={selected !== null}
        animationType="fade"
        transparent
        onRequestClose={handleCloseModal}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, styles.backdrop]}
            onPress={showAlbumPicker ? () => setShowAlbumPicker(false) : handleCloseModal}
          />
          <View style={styles.overlayCenter} pointerEvents="box-none">
            <View style={styles.modal}>
              {selected && (
                showAlbumPicker ? (
                  <>
                    <View style={styles.pickerHeader}>
                      <Text style={styles.pickerTitle}>移動先のアルバム</Text>
                      <TouchableOpacity onPress={() => setShowAlbumPicker(false)}>
                        <Text style={styles.pickerCancel}>キャンセル</Text>
                      </TouchableOpacity>
                    </View>
                    {loadingAlbums ? (
                      <ActivityIndicator color={COLORS.accent} style={{ marginVertical: SPACING.xxl }} />
                    ) : (
                      <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled">
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
                              placeholderTextColor={COLORS.inkSoft}
                              value={newAlbumName}
                              onChangeText={setNewAlbumName}
                              autoFocus
                            />
                            <TouchableOpacity
                              style={[styles.primaryBtn, (!newAlbumName.trim() || moving) && styles.btnDisabled]}
                              onPress={() => handleMoveToAlbum(null)}
                              disabled={!newAlbumName.trim() || moving}
                            >
                              {moving
                                ? <ActivityIndicator color={COLORS.white} size="small" />
                                : <Text style={styles.primaryBtnText}>作成して移動</Text>
                              }
                            </TouchableOpacity>
                          </View>
                        )}
                      </ScrollView>
                    )}
                  </>
                ) : (
                  <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
                    <TouchableOpacity activeOpacity={0.9} onPress={() => setShowPhotoFull(true)}>
                      <Image source={{ uri: selected.image_url }} style={styles.modalImage} resizeMode="cover" />
                    </TouchableOpacity>

                    {selected.isUnlocked ? (
                      <>
                        <View style={styles.modalSection}>
                          <Text style={styles.sectionLabel}>思い出のメッセージ</Text>
                          {selected.isFresh ? (
                            <>
                              <TouchableOpacity
                                style={styles.textTapArea}
                                onPress={() => setEditorTarget('original')}
                                activeOpacity={0.7}
                              >
                                {originalEditText ? (
                                  <Text style={styles.textPreview}>{originalEditText}</Text>
                                ) : (
                                  <Text style={styles.textPlaceholder}>メッセージを書く…</Text>
                                )}
                                <View style={styles.pencilWrap}>
                                  <Ionicons name="pencil-outline" size={13} color={COLORS.inkSoft} />
                                </View>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.primaryBtn, (!originalEditText.trim() || originalSaving) && styles.btnDisabled]}
                                onPress={handleSaveOriginal}
                                disabled={!originalEditText.trim() || originalSaving}
                              >
                                {originalSaving
                                  ? <ActivityIndicator color={COLORS.white} size="small" />
                                  : <Text style={styles.primaryBtnText}>更新する</Text>
                                }
                              </TouchableOpacity>
                            </>
                          ) : (
                            selected.originalMessage
                              ? <Text style={styles.modalMessage}>{selected.originalMessage.content}</Text>
                              : null
                          )}
                        </View>

                        {selected.unlockEntries.filter(e => !e.isActive && (e.message || e.memoryImageUrl)).length > 0 && (
                          <View style={styles.modalSection}>
                            <Text style={styles.sectionLabel}>過去の訪問</Text>
                            {selected.unlockEntries
                              .filter(e => !e.isActive && (e.message || e.memoryImageUrl))
                              .map(e => (
                                <View key={e.unlockRecordId} style={styles.visitItem}>
                                  <Text style={styles.visitDate}>{formatDate(e.unlockedAt)}</Text>
                                  {e.memoryImageUrl && (
                                    <Image source={{ uri: e.memoryImageUrl }} style={styles.visitMemoryThumb} resizeMode="cover" />
                                  )}
                                  {e.message && (
                                    <Text style={styles.visitContent}>{e.message.content}</Text>
                                  )}
                                </View>
                              ))
                            }
                          </View>
                        )}

                        {selected.currentUnlockRecordId && (
                          <View style={[styles.modalSection, styles.modalSectionDivider]}>
                            <Text style={styles.sectionLabel}>
                              {formatDate(selected.unlockEntries.find(e => e.isActive)?.unlockedAt ?? '')} の記録
                            </Text>
                            {selected.unlockEntries.find(e => e.isActive)?.memoryImageUrl && (
                              <Image
                                source={{ uri: selected.unlockEntries.find(e => e.isActive)!.memoryImageUrl! }}
                                style={styles.visitMemoryThumb}
                                resizeMode="cover"
                              />
                            )}
                            <TouchableOpacity
                              style={styles.textTapArea}
                              onPress={() => setEditorTarget('followup')}
                              activeOpacity={0.7}
                            >
                              {appendText ? (
                                <Text style={styles.textPreview}>{appendText}</Text>
                              ) : (
                                <Text style={styles.textPlaceholder}>今の気持ちを書き留めておく…</Text>
                              )}
                              <View style={styles.pencilWrap}>
                                <Ionicons name="pencil-outline" size={13} color={COLORS.inkSoft} />
                              </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.primaryBtn, (!appendText.trim() || appendSaving) && styles.btnDisabled]}
                              onPress={handleSaveFollowUp}
                              disabled={!appendText.trim() || appendSaving}
                            >
                              {appendSaving
                                ? <ActivityIndicator color={COLORS.white} size="small" />
                                : <Text style={styles.primaryBtnText}>
                                    {selected.unlockEntries.find(e => e.isActive)?.message ? '更新する' : '保存する'}
                                  </Text>
                              }
                            </TouchableOpacity>
                          </View>
                        )}

                        {canMessage && selected.othersEntries.filter(e => e.message).length > 0 && (
                          <View style={styles.modalSection}>
                            <Text style={styles.sectionLabel}>共有者の訪問記録</Text>
                            {selected.othersEntries
                              .filter(e => e.message)
                              .map(e => (
                                <View key={e.unlockRecordId} style={styles.sharedItem}>
                                  <Text style={styles.visitDate}>{formatDate(e.unlockedAt)}</Text>
                                  <Text style={styles.visitContent}>{e.message!.content}</Text>
                                </View>
                              ))
                            }
                          </View>
                        )}
                      </>
                    ) : selected.isSealed ? (
                      <View style={styles.lockedContent}>
                        <Ionicons name="lock-closed-outline" size={28} color={COLORS.inkSoft} style={{ marginBottom: SPACING.sm }} />
                        <Text style={styles.sealedDateModal}>
                          {new Date(selected.unlock_at!).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </Text>
                        <Text style={styles.lockedHintModal}>
                          この日まで封印されています{'\n'}通知が届いたら現地へ向かいましょう
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.lockedContent}>
                        <Text style={styles.lockedHintModal}>
                          この場所へ戻り同じ風景を撮影すると{'\n'}メッセージが現れます
                        </Text>
                      </View>
                    )}

                    <View style={styles.modalFooter}>
                      <Text style={styles.modalDate}>{formatDate(selected.taken_at)}</Text>
                      {isOwnPhoto && (
                        <View style={styles.footerActions}>
                          {showMoveAction && (
                            <TouchableOpacity style={styles.actionBtn} onPress={openAlbumPicker}>
                              <Ionicons name="folder-open-outline" size={22} color={COLORS.accent} />
                              <Text style={styles.actionBtnLabel}>移動</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity style={styles.actionBtn} onPress={handleDelete} disabled={deleting}>
                            {deleting
                              ? <ActivityIndicator size="small" color={COLORS.danger} />
                              : <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
                            }
                            <Text style={[styles.actionBtnLabel, styles.actionBtnLabelDanger]}>削除</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </ScrollView>
                )
              )}
            </View>
          </View>
        </View>

        {showPhotoFull && selected && (
          <Pressable style={styles.photoFullScreen} onPress={() => setShowPhotoFull(false)}>
            <Image
              source={{ uri: selected.image_url }}
              style={styles.photoFullImage}
              resizeMode="contain"
            />
            <TouchableOpacity style={styles.photoFullCloseBtn} onPress={() => setShowPhotoFull(false)}>
              <Ionicons name="close" size={26} color={COLORS.paper} />
            </TouchableOpacity>
          </Pressable>
        )}

        <TextEditorModal
          visible={editorTarget !== null}
          title={editorTarget === 'original' ? '思い出のメッセージ' : '今の気持ち'}
          placeholder={editorTarget === 'original' ? 'メッセージを書く…' : '今の気持ちを書き留めておく…'}
          initialValue={editorTarget === 'original' ? originalEditText : appendText}
          onSave={(text) => {
            if (editorTarget === 'original') setOriginalEditText(text)
            else setAppendText(text)
            setEditorTarget(null)
          }}
          onCancel={() => setEditorTarget(null)}
        />
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xxxl },
  emptyText: { ...TYPE.caption, color: COLORS.inkSoft, textAlign: 'center' },

  // Journal layout — 1カラム縦流し
  journal: {
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.huge,
  },
  entry: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.huge,
    paddingBottom: SPACING.md,
  },
  entryFirst: { paddingTop: SPACING.xl },
  entryDate: {
    ...TYPE.date,
    marginBottom: SPACING.lg,
  },
  entryImage: {
    width: SCREEN_WIDTH - SPACING.xl * 2,
    height: (SCREEN_WIDTH - SPACING.xl * 2) * 1.0,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLORS.paperDeep,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(44,38,32,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.thumb,
  },
  lockText: {
    fontFamily: FONTS.serif,
    fontSize: 16,
    color: COLORS.paper,
    letterSpacing: 2,
  },
  messageWrap: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.xs,
  },
  quoteOpen: {
    fontFamily: FONTS.serif,
    fontSize: 22,
    color: COLORS.inkSub,
    lineHeight: 22,
    marginBottom: -6,
  },
  messageBody: {
    ...TYPE.bodySerif,
    paddingHorizontal: SPACING.md,
  },
  quoteClose: {
    fontFamily: FONTS.serif,
    fontSize: 22,
    color: COLORS.inkSub,
    lineHeight: 22,
    textAlign: 'right',
    marginTop: -6,
  },
  expandBtn: {
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.xs,
    alignSelf: 'flex-start',
  },
  expandBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: COLORS.inkSub,
    letterSpacing: 0.3,
  },
  lockedHint: {
    ...TYPE.caption,
    color: COLORS.inkSoft,
    marginTop: SPACING.md,
    fontStyle: 'italic',
  },

  // Modal
  backdrop: {
    backgroundColor: 'rgba(44,38,32,0.6)',
  },
  overlayCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxl,
  },
  modal: {
    width: '100%',
    backgroundColor: COLORS.paper,
    borderRadius: SPACING.sm,
    overflow: 'hidden',
    maxHeight: '88%',
  },
  modalImage: { width: '100%', height: 240 },
  modalSection: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, gap: SPACING.sm },
  modalSectionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.rule,
    marginTop: SPACING.md,
    paddingTop: SPACING.lg,
  },
  sectionLabel: {
    ...TYPE.meta,
    textTransform: 'uppercase',
  },
  modalMessage: {
    ...TYPE.bodySerif,
  },
  visitItem: {
    backgroundColor: COLORS.paperDeep,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.rule,
  },
  sharedItem: {
    backgroundColor: COLORS.paperDeep,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.seal,
  },
  visitDate: {
    fontFamily: FONTS.serif,
    fontSize: 13,
    color: COLORS.inkSub,
  },
  visitMemoryThumb: {
    width: '100%',
    height: 160,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLORS.paperDeep,
    marginTop: SPACING.xs,
  },
  visitContent: {
    ...TYPE.body,
    fontSize: 14,
    lineHeight: 22,
  },
  textTapArea: {
    minHeight: 90,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
    borderRadius: RADIUS.thumb,
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    marginTop: SPACING.xs,
  },
  textPreview: {
    fontFamily: FONTS.serif,
    fontSize: 15,
    color: COLORS.ink,
    lineHeight: 24,
  },
  textPlaceholder: {
    fontFamily: FONTS.serif,
    fontSize: 15,
    color: COLORS.inkSoft,
    fontStyle: 'italic',
  },
  pencilWrap: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
  },

  appendInput: {
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: RADIUS.thumb,
    padding: SPACING.md,
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.ink,
    minHeight: 90,
    backgroundColor: COLORS.white,
    lineHeight: 22,
    marginTop: SPACING.xs,
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.thumb,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  primaryBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.white,
    letterSpacing: 1,
  },
  btnDisabled: { opacity: 0.45 },

  lockedContent: {
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.xxl,
    alignItems: 'center',
  },
  sealedDateModal: {
    fontFamily: FONTS.serif,
    fontSize: 17,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  lockedHintModal: {
    ...TYPE.caption,
    color: COLORS.inkSoft,
    textAlign: 'center',
  },

  modalFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.rule,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalDate: {
    fontFamily: FONTS.serif,
    fontSize: 14,
    color: COLORS.inkSub,
  },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minWidth: 56,
  },
  actionBtnLabel: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: COLORS.accent,
    letterSpacing: 0.3,
  },
  actionBtnLabelDanger: { color: COLORS.danger },

  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  pickerTitle: {
    fontFamily: FONTS.serif,
    fontSize: 16,
    color: COLORS.ink,
  },
  pickerCancel: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.inkSub,
  },
  pickerScroll: { maxHeight: 320 },
  pickerRow: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  pickerRowSelected: { backgroundColor: COLORS.paperDeep },
  pickerRowText: {
    fontFamily: FONTS.serif,
    fontSize: 15,
    color: COLORS.ink,
  },
  photoFullScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  photoFullCloseBtn: {
    position: 'absolute',
    top: SPACING.xxl + 16,
    right: SPACING.xl,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: SPACING.sm,
  },

  newAlbumRow: { paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, gap: SPACING.sm },
  newAlbumInput: {
    borderWidth: 1,
    borderColor: COLORS.rule,
    borderRadius: RADIUS.thumb,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.ink,
    backgroundColor: COLORS.white,
  },
})
