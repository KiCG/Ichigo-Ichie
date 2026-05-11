import React, { useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
  TextInput,
  Share,
  Dimensions,
  Switch,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import QRCode from 'react-native-qrcode-svg'
import { supabase } from '../../lib/supabase'
import type { AlbumStackParamList } from '../../types'

const COLORS = {
  background: '#FAFAF7',
  accent: '#8B7355',
  text: '#2C2C2C',
  subtext: '#9E9E9E',
  border: '#E0D9D0',
}

const SCREEN_WIDTH = Dimensions.get('window').width
const QR_SIZE = Math.min(SCREEN_WIDTH - 120, 220)
const SCANNER_SIZE = SCREEN_WIDTH - 96

type Props = {
  navigation: NativeStackNavigationProp<AlbumStackParamList, 'AlbumList'>
}

type AlbumCard = {
  id: string
  title: string
  coverUrl: string | null
  photoCount: number
  bookshelfId: string | null
  bookshelfTitle: string | null
}

type SharedAlbumCard = {
  id: string
  title: string
  coverUrl: string | null
  photoCount: number
  shareId: string
}

type ShelfOption = { id: string; title: string }

export default function AlbumListScreen({ navigation }: Props) {
  const [albums, setAlbums] = useState<AlbumCard[]>([])
  const [sharedAlbums, setSharedAlbums] = useState<SharedAlbumCard[]>([])
  const [bookshelves, setBookshelves] = useState<ShelfOption[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [moveTarget, setMoveTarget] = useState<AlbumCard | null>(null)
  const [moving, setMoving] = useState(false)

  // Share settings modal (step 1)
  const [shareSettingsModal, setShareSettingsModal] = useState(false)
  const [pendingAlbum, setPendingAlbum] = useState<AlbumCard | null>(null)
  const [settingCanMessage, setSettingCanMessage] = useState(false)
  const [settingCanAddPhotos, setSettingCanAddPhotos] = useState(false)
  const [generating, setGenerating] = useState(false)

  // QR code display modal (step 2)
  const [qrModal, setQrModal] = useState<{ token: string; albumTitle: string } | null>(null)

  // Accept modal
  const [showShareCodeModal, setShowShareCodeModal] = useState(false)
  const [shareCodeInput, setShareCodeInput] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [showQrScanner, setShowQrScanner] = useState(false)
  const [scanned, setScanned] = useState(false)

  const [cameraPermission, requestCameraPermission] = useCameraPermissions()

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [
      { data: albumData },
      { data: shelfData },
      { data: shareData },
    ] = await Promise.all([
      supabase
        .from('albums')
        .select('id, title, bookshelf_id')
        .eq('user_id', user.id)
        .eq('is_desk', false)
        .order('created_at', { ascending: false }),
      supabase
        .from('bookshelves')
        .select('id, title')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('album_shares')
        .select('id, album_id')
        .eq('shared_to_user_id', user.id),
    ])

    setBookshelves(shelfData ?? [])

    const shelfMap: Record<string, string> = {}
    for (const s of shelfData ?? []) shelfMap[s.id] = s.title

    if (!albumData?.length) {
      setAlbums([])
    } else {
      const albumIds = albumData.map(a => a.id)
      const { data: photoData } = await supabase
        .from('photos')
        .select('id, album_id, image_url')
        .in('album_id', albumIds)
        .order('taken_at', { ascending: true })

      const statsMap: Record<string, { count: number; coverUrl: string | null }> = {}
      for (const p of photoData ?? []) {
        if (!statsMap[p.album_id]) statsMap[p.album_id] = { count: 0, coverUrl: null }
        statsMap[p.album_id].count++
        if (!statsMap[p.album_id].coverUrl) statsMap[p.album_id].coverUrl = p.image_url
      }

      setAlbums(albumData.map(a => ({
        id: a.id,
        title: a.title,
        coverUrl: statsMap[a.id]?.coverUrl ?? null,
        photoCount: statsMap[a.id]?.count ?? 0,
        bookshelfId: a.bookshelf_id ?? null,
        bookshelfTitle: a.bookshelf_id ? (shelfMap[a.bookshelf_id] ?? null) : null,
      })))
    }

    if (!shareData?.length) {
      setSharedAlbums([])
      return
    }

    const shareMap: Record<string, string> = {}
    const sharedAlbumIds: string[] = []
    for (const s of shareData) {
      shareMap[s.album_id] = s.id
      sharedAlbumIds.push(s.album_id)
    }

    const [{ data: sharedAlbumData }, { data: sharedPhotoData }] = await Promise.all([
      supabase.from('albums').select('id, title').in('id', sharedAlbumIds),
      supabase
        .from('photos')
        .select('id, album_id, image_url')
        .in('album_id', sharedAlbumIds)
        .order('taken_at', { ascending: true }),
    ])

    const coverMap: Record<string, string | null> = {}
    const countMap: Record<string, number> = {}
    for (const p of sharedPhotoData ?? []) {
      if (!coverMap[p.album_id]) coverMap[p.album_id] = p.image_url
      countMap[p.album_id] = (countMap[p.album_id] ?? 0) + 1
    }

    setSharedAlbums(sharedAlbumData?.map(a => ({
      id: a.id,
      title: a.title,
      coverUrl: coverMap[a.id] ?? null,
      photoCount: countMap[a.id] ?? 0,
      shareId: shareMap[a.id],
    })) ?? [])
  }, [])

  const isFirstLoad = useRef(true)

  useFocusEffect(
    useCallback(() => {
      if (isFirstLoad.current) {
        fetchData().finally(() => { setLoading(false); isFirstLoad.current = false })
      } else {
        fetchData()
      }
    }, [fetchData])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }, [fetchData])

  const openShareSettings = (album: AlbumCard) => {
    setPendingAlbum(album)
    setSettingCanMessage(false)
    setSettingCanAddPhotos(false)
    setShareSettingsModal(true)
  }

  const handleGenerateShare = async () => {
    if (!pendingAlbum) return
    setGenerating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase
        .from('album_shares')
        .insert({
          album_id: pendingAlbum.id,
          shared_by_user_id: user.id,
          permission: 'read_only',
          can_message: settingCanMessage,
          can_add_photos: settingCanAddPhotos,
        })
        .select('share_token')
        .single()
      if (error || !data) throw error ?? new Error('failed')
      setShareSettingsModal(false)
      setQrModal({ token: String(data.share_token), albumTitle: pendingAlbum.title })
    } catch {
      Alert.alert('エラー', '共有コードの生成に失敗しました。')
    } finally {
      setGenerating(false)
    }
  }

  const handleLongPress = (album: AlbumCard) => {
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
      { text: '共有する', onPress: () => openShareSettings(album) },
      {
        text: album.bookshelfId ? '別の本棚に移動' : '本棚に移動',
        onPress: () => setMoveTarget(album),
      },
    ]
    if (album.bookshelfId) {
      options.push({
        text: '本棚から外す',
        onPress: async () => {
          try {
            await supabase.from('albums').update({ bookshelf_id: null }).eq('id', album.id)
            setAlbums(prev => prev.map(a =>
              a.id === album.id ? { ...a, bookshelfId: null, bookshelfTitle: null } : a
            ))
          } catch {
            Alert.alert('エラー', '操作に失敗しました。')
          }
        },
      })
    }
    options.push({ text: 'アルバムを削除', style: 'destructive', onPress: () => handleDeleteAlbum(album) })
    options.push({ text: 'キャンセル', style: 'cancel' })
    Alert.alert(album.title, '', options)
  }

  const handleLongPressShared = (album: SharedAlbumCard) => {
    Alert.alert(album.title, '', [
      {
        text: '共有を外す',
        style: 'destructive',
        onPress: () => Alert.alert(
          '共有を外しますか？',
          `「${album.title}」の共有を解除します。`,
          [
            { text: 'キャンセル', style: 'cancel' },
            {
              text: '共有を外す',
              style: 'destructive',
              onPress: async () => {
                try {
                  await supabase.from('album_shares').delete().eq('id', album.shareId)
                  setSharedAlbums(prev => prev.filter(a => a.id !== album.id))
                } catch {
                  Alert.alert('エラー', '操作に失敗しました。もう一度お試しください。')
                }
              },
            },
          ]
        ),
      },
      { text: 'キャンセル', style: 'cancel' },
    ])
  }

  const handleDeleteAlbum = (album: AlbumCard) => {
    Alert.alert(
      'アルバムを削除しますか？',
      `「${album.title}」を削除します。\nアルバム内の写真は机の上に移動されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser()
              if (!user) return
              const { data: deskAlbum } = await supabase
                .from('albums').select('id').eq('user_id', user.id).eq('is_desk', true).single()
              if (!deskAlbum) throw new Error('机アルバムが見つかりません')
              await supabase.from('photos').update({ album_id: deskAlbum.id }).eq('album_id', album.id)
              await supabase.from('albums').delete().eq('id', album.id)
              setAlbums(prev => prev.filter(a => a.id !== album.id))
            } catch {
              Alert.alert('エラー', '削除に失敗しました。もう一度お試しください。')
            }
          },
        },
      ]
    )
  }

  const handleMoveToBookshelf = async (bookshelfId: string) => {
    if (!moveTarget) return
    setMoving(true)
    try {
      const { error } = await supabase
        .from('albums').update({ bookshelf_id: bookshelfId }).eq('id', moveTarget.id)
      if (error) throw error
      const shelf = bookshelves.find(s => s.id === bookshelfId)
      setAlbums(prev => prev.map(a =>
        a.id === moveTarget.id
          ? { ...a, bookshelfId: bookshelfId, bookshelfTitle: shelf?.title ?? null }
          : a
      ))
      setMoveTarget(null)
    } catch {
      Alert.alert('エラー', '移動に失敗しました。もう一度お試しください。')
    } finally {
      setMoving(false)
    }
  }

  const handleAcceptShare = async (tokenOverride?: string) => {
    const token = (tokenOverride ?? shareCodeInput).trim()
    if (!token) return
    setAccepting(true)
    try {
      const { data, error } = await supabase.rpc('accept_album_share', { p_token: token })
      if (error) throw error
      if (!data) {
        Alert.alert('無効なコード', 'このコードは無効か、すでに使用済みです。')
        return
      }
      setShowShareCodeModal(false)
      setShareCodeInput('')
      setShowQrScanner(false)
      await fetchData()
      Alert.alert('追加しました', '共有アルバムが追加されました。')
    } catch {
      Alert.alert('エラー', '操作に失敗しました。もう一度お試しください。')
    } finally {
      setAccepting(false)
    }
  }

  const handleOpenQrScanner = async () => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission()
      if (!granted) {
        Alert.alert('カメラへのアクセスが必要です', '設定からカメラの使用を許可してください。')
        return
      }
    }
    setScanned(false)
    setShowQrScanner(true)
  }

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return
    setScanned(true)
    setShowQrScanner(false)
    handleAcceptShare(data)
  }

  const closeAcceptModal = () => {
    setShowShareCodeModal(false)
    setShareCodeInput('')
    setShowQrScanner(false)
    setScanned(false)
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    )
  }

  const renderOwnCard = (item: AlbumCard) => (
    <TouchableOpacity
      key={item.id}
      style={styles.card}
      onPress={() => navigation.navigate('AlbumDetail', { albumId: item.id, albumTitle: item.title })}
      onLongPress={() => handleLongPress(item)}
      activeOpacity={0.8}
    >
      {item.coverUrl ? (
        <Image source={{ uri: item.coverUrl }} style={styles.cover} resizeMode="cover" />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Text style={styles.coverPlaceholderText}>写真なし</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.albumTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.photoCount}>{item.photoCount}枚</Text>
        {item.bookshelfTitle && (
          <View style={styles.shelfBadge}>
            <Text style={styles.shelfBadgeText}>📚 {item.bookshelfTitle}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )

  const renderSharedCard = (item: SharedAlbumCard) => (
    <TouchableOpacity
      key={item.id}
      style={styles.card}
      onPress={() => navigation.navigate('AlbumDetail', { albumId: item.id, albumTitle: item.title })}
      onLongPress={() => handleLongPressShared(item)}
      activeOpacity={0.8}
    >
      {item.coverUrl ? (
        <Image source={{ uri: item.coverUrl }} style={styles.cover} resizeMode="cover" />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Text style={styles.coverPlaceholderText}>写真なし</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.albumTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.photoCount}>{item.photoCount}枚</Text>
        <View style={styles.sharedBadge}>
          <Text style={styles.sharedBadgeText}>共有</Text>
        </View>
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
      >
        <TouchableOpacity
          style={styles.shareCodeRow}
          onPress={() => setShowShareCodeModal(true)}
        >
          <Text style={styles.shareCodeRowText}>共有コードを入力 / QRスキャン</Text>
        </TouchableOpacity>

        {albums.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>アルバムがありません</Text>
            <Text style={styles.emptySubtext}>
              写真を撮ってメッセージを残すとアルバムが作られます
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {albums.map(renderOwnCard)}
          </View>
        )}

        {sharedAlbums.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>共有されたアルバム</Text>
            </View>
            <View style={styles.list}>
              {sharedAlbums.map(renderSharedCard)}
            </View>
          </>
        )}
      </ScrollView>

      {/* Bookshelf picker */}
      <Modal
        visible={moveTarget !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setMoveTarget(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setMoveTarget(null)}>
          <Pressable style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>本棚を選ぶ</Text>
              <TouchableOpacity onPress={() => setMoveTarget(null)}>
                <Text style={styles.cancelText}>キャンセル</Text>
              </TouchableOpacity>
            </View>
            {bookshelves.length === 0 ? (
              <View style={styles.pickerEmpty}>
                <Text style={styles.emptySubtext}>
                  本棚がありません。{'\n'}本棚タブから先に本棚を作成してください。
                </Text>
              </View>
            ) : (
              bookshelves.map(shelf => (
                <TouchableOpacity
                  key={shelf.id}
                  style={[styles.pickerRow, moveTarget?.bookshelfId === shelf.id && styles.pickerRowActive]}
                  onPress={() => handleMoveToBookshelf(shelf.id)}
                  disabled={moving}
                >
                  <Text style={styles.pickerRowText}>{shelf.title}</Text>
                  {moveTarget?.bookshelfId === shelf.id && (
                    <Text style={styles.pickerRowSub}>現在</Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Share settings modal (step 1) */}
      <Modal
        visible={shareSettingsModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShareSettingsModal(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShareSettingsModal(false)}>
          <Pressable style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>共有設定</Text>
              <TouchableOpacity onPress={() => setShareSettingsModal(false)}>
                <Text style={styles.cancelText}>キャンセル</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.settingsBody}>
              {pendingAlbum && (
                <Text style={styles.settingsAlbumName} numberOfLines={1}>
                  {pendingAlbum.title}
                </Text>
              )}
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>メッセージを相互表示する</Text>
                  <Text style={styles.settingDesc}>
                    お互いの訪問メッセージが見られるようになります
                  </Text>
                </View>
                <Switch
                  value={settingCanMessage}
                  onValueChange={setSettingCanMessage}
                  trackColor={{ true: COLORS.accent }}
                  thumbColor="#fff"
                />
              </View>
              <View style={[styles.settingRow, styles.settingRowLast]}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>写真の追加を許可する</Text>
                  <Text style={styles.settingDesc}>
                    受け取った側もアルバムに写真を追加できます
                  </Text>
                </View>
                <Switch
                  value={settingCanAddPhotos}
                  onValueChange={setSettingCanAddPhotos}
                  trackColor={{ true: COLORS.accent }}
                  thumbColor="#fff"
                />
              </View>
              <TouchableOpacity
                style={[styles.generateButton, generating && styles.buttonDisabled]}
                onPress={handleGenerateShare}
                disabled={generating}
              >
                {generating
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.generateButtonText}>共有コードを生成する</Text>
                }
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* QR code display modal (step 2) */}
      <Modal
        visible={qrModal !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setQrModal(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setQrModal(null)}>
          <Pressable style={styles.qrDisplayModal}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>アルバムを共有</Text>
              <TouchableOpacity onPress={() => setQrModal(null)}>
                <Text style={styles.cancelText}>閉じる</Text>
              </TouchableOpacity>
            </View>
            {qrModal && (
              <View style={styles.qrContent}>
                <Text style={styles.qrAlbumTitle} numberOfLines={1}>{qrModal.albumTitle}</Text>
                <View style={styles.qrWrapper}>
                  <QRCode value={qrModal.token} size={QR_SIZE} backgroundColor="#fff" />
                </View>
                <Text style={styles.qrHint}>
                  相手にこのQRコードをスキャンしてもらうか{'\n'}共有シートでコードを送ってください
                </Text>
                <TouchableOpacity
                  style={styles.shareSheetButton}
                  onPress={() => Share.share({
                    message: `一期一会のアルバム「${qrModal.albumTitle}」を共有します。\n共有コード: ${qrModal.token}`,
                  })}
                >
                  <Text style={styles.shareSheetButtonText}>共有シートで送る</Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Accept share modal */}
      <Modal
        visible={showShareCodeModal}
        animationType="fade"
        transparent
        onRequestClose={closeAcceptModal}
      >
        <Pressable style={styles.overlay} onPress={showQrScanner ? undefined : closeAcceptModal}>
          <Pressable style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>共有アルバムを追加</Text>
              <TouchableOpacity onPress={closeAcceptModal}>
                <Text style={styles.cancelText}>キャンセル</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, !showQrScanner && styles.toggleBtnActive]}
                onPress={() => setShowQrScanner(false)}
              >
                <Text style={[styles.toggleBtnText, !showQrScanner && styles.toggleBtnTextActive]}>
                  コードを入力
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, showQrScanner && styles.toggleBtnActive]}
                onPress={handleOpenQrScanner}
              >
                <Text style={[styles.toggleBtnText, showQrScanner && styles.toggleBtnTextActive]}>
                  QRスキャン
                </Text>
              </TouchableOpacity>
            </View>
            {showQrScanner ? (
              <View style={styles.scannerWrapper}>
                <CameraView
                  style={styles.scanner}
                  facing="back"
                  onBarcodeScanned={handleBarcodeScanned}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                />
                <View style={styles.scannerFrame} pointerEvents="none" />
                {accepting && (
                  <View style={styles.scannerOverlay}>
                    <ActivityIndicator color="#fff" size="large" />
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.shareCodeInputWrapper}>
                <TextInput
                  style={styles.shareCodeInput}
                  value={shareCodeInput}
                  onChangeText={setShareCodeInput}
                  placeholder="共有コードを貼り付け"
                  placeholderTextColor={COLORS.subtext}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[styles.acceptButton, (!shareCodeInput.trim() || accepting) && styles.buttonDisabled]}
                  onPress={() => handleAcceptShare()}
                  disabled={!shareCodeInput.trim() || accepting}
                >
                  {accepting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.acceptButtonText}>追加する</Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  scrollContent: { paddingBottom: 32 },
  emptySection: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 8 },
  emptyText: { fontSize: 15, color: COLORS.text, textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: COLORS.subtext, textAlign: 'center', lineHeight: 20 },
  shareCodeRow: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  shareCodeRowText: { fontSize: 14, color: COLORS.accent },
  list: { padding: 16, paddingTop: 8, gap: 12 },
  sectionHeader: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  sectionHeaderText: { fontSize: 12, color: COLORS.subtext, letterSpacing: 1 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cover: { width: 100, height: 100 },
  coverPlaceholder: { backgroundColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  coverPlaceholderText: { fontSize: 11, color: COLORS.subtext },
  cardBody: { flex: 1, padding: 14, justifyContent: 'space-between', gap: 4 },
  albumTitle: { fontSize: 15, color: COLORS.text, fontWeight: '500', lineHeight: 21 },
  photoCount: { fontSize: 12, color: COLORS.subtext },
  shelfBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0EDE8',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  shelfBadgeText: { fontSize: 11, color: COLORS.accent },
  sharedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F0F0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sharedBadgeText: { fontSize: 11, color: '#4A7A7A' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  pickerModal: { width: '100%', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  pickerTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  cancelText: { fontSize: 14, color: COLORS.subtext },
  pickerEmpty: { padding: 24, alignItems: 'center' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  pickerRowActive: { backgroundColor: '#F5EFE6' },
  pickerRowText: { fontSize: 15, color: COLORS.text },
  pickerRowSub: { fontSize: 12, color: COLORS.subtext },
  // Share settings
  settingsBody: { padding: 20, gap: 16 },
  settingsAlbumName: {
    fontSize: 13,
    color: COLORS.subtext,
    textAlign: 'center',
    marginBottom: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  settingRowLast: { borderBottomWidth: 0 },
  settingInfo: { flex: 1, gap: 2 },
  settingLabel: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  settingDesc: { fontSize: 12, color: COLORS.subtext, lineHeight: 17 },
  generateButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  generateButtonText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  // QR display
  qrDisplayModal: { width: '100%', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  qrContent: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 24, gap: 16 },
  qrAlbumTitle: { fontSize: 14, color: COLORS.subtext, marginTop: 4 },
  qrWrapper: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  qrHint: { fontSize: 12, color: COLORS.subtext, textAlign: 'center', lineHeight: 18 },
  shareSheetButton: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  shareSheetButtonText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  // Toggle
  toggleRow: {
    flexDirection: 'row',
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  toggleBtnActive: { backgroundColor: COLORS.accent },
  toggleBtnText: { fontSize: 13, color: COLORS.subtext },
  toggleBtnTextActive: { color: '#fff', fontWeight: '500' },
  // Scanner
  scannerWrapper: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    height: SCANNER_SIZE,
    position: 'relative',
  },
  scanner: { width: '100%', height: '100%' },
  scannerFrame: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 180,
    height: 180,
    marginTop: -90,
    marginLeft: -90,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 12,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Text input
  shareCodeInputWrapper: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  shareCodeInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.text,
  },
  acceptButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  acceptButtonText: { color: '#fff', fontSize: 14, fontWeight: '500' },
})
