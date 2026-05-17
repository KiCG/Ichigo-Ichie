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
  Dimensions,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import AcceptShareModal from '../../components/AcceptShareModal'
import ShareAlbumModal from '../../components/ShareAlbumModal'
import ManageSharesModal from '../../components/ManageSharesModal'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { COLORS, FONTS, SPACING, TYPE, RADIUS } from '../../theme'
import type { MemoriesStackParamList } from '../../types'

const SCREEN_WIDTH = Dimensions.get('window').width

type Props = {
  navigation: NativeStackNavigationProp<MemoriesStackParamList, 'AlbumList'>
}

type AlbumCard = {
  id: string
  title: string
  coverUrl: string | null
  photoCount: number
  bookshelfId: string | null
  bookshelfTitle: string | null
  createdAt: string
}

type SharedAlbumCard = {
  id: string
  title: string
  coverUrl: string | null
  photoCount: number
  shareId: string
}

type ShelfOption = { id: string; title: string }

function formatYearMonth(d: string): string {
  const date = new Date(d)
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

export default function AlbumListScreen({ navigation }: Props) {
  const [albums, setAlbums] = useState<AlbumCard[]>([])
  const [sharedAlbums, setSharedAlbums] = useState<SharedAlbumCard[]>([])
  const [bookshelves, setBookshelves] = useState<ShelfOption[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [moveTarget, setMoveTarget] = useState<AlbumCard | null>(null)
  const [moving, setMoving] = useState(false)

  const [pendingAlbum, setPendingAlbum] = useState<AlbumCard | null>(null)
  const [manageTarget, setManageTarget] = useState<{ id: string; title: string } | null>(null)

  const [showShareCodeModal, setShowShareCodeModal] = useState(false)

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
        .select('id, title, bookshelf_id, created_at')
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
        createdAt: a.created_at,
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

  const handleLongPress = (album: AlbumCard) => {
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
      { text: '共有する', onPress: () => setPendingAlbum(album) },
      { text: '共有を管理', onPress: () => setManageTarget(album) },
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    )
  }

  const renderOwnRow = (item: AlbumCard) => (
    <TouchableOpacity
      key={item.id}
      style={styles.row}
      onPress={() => navigation.navigate('AlbumDetail', { albumId: item.id, albumTitle: item.title })}
      onLongPress={() => handleLongPress(item)}
      activeOpacity={0.7}
    >
      {item.coverUrl ? (
        <Image source={{ uri: item.coverUrl }} style={styles.cover} resizeMode="cover" />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]} />
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowDate}>{formatYearMonth(item.createdAt)}</Text>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <View style={styles.rowMetaLine}>
          <Text style={styles.rowMeta}>{item.photoCount}枚</Text>
          {item.bookshelfTitle && (
            <Text style={styles.rowShelf}>・{item.bookshelfTitle}</Text>
          )}
        </View>
      </View>
      <TouchableOpacity style={styles.moreBtn} onPress={() => handleLongPress(item)} hitSlop={8}>
        <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.inkSoft} />
      </TouchableOpacity>
    </TouchableOpacity>
  )

  const renderSharedRow = (item: SharedAlbumCard) => (
    <TouchableOpacity
      key={item.id}
      style={styles.row}
      onPress={() => navigation.navigate('AlbumDetail', { albumId: item.id, albumTitle: item.title })}
      activeOpacity={0.7}
    >
      {item.coverUrl ? (
        <Image source={{ uri: item.coverUrl }} style={styles.cover} resizeMode="cover" />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]} />
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowDate}>共有アルバム</Text>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.rowMeta}>{item.photoCount}枚</Text>
      </View>
      <View style={styles.sealBadge}>
        <Text style={styles.sealText}>共</Text>
      </View>
      <TouchableOpacity style={styles.moreBtn} onPress={() => handleLongPressShared(item)} hitSlop={8}>
        <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.inkSoft} />
      </TouchableOpacity>
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
          style={styles.acceptBtn}
          onPress={() => setShowShareCodeModal(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.acceptBtnText}>共有アルバムを追加</Text>
        </TouchableOpacity>

        {albums.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>アルバムはまだありません</Text>
            <Text style={styles.emptySubtext}>写真にメッセージを残すと、アルバムが綴られます</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {albums.map(renderOwnRow)}
          </View>
        )}

        {sharedAlbums.length > 0 && (
          <>
            <Text style={styles.sectionDivider}>共有されたアルバム</Text>
            <View style={styles.list}>
              {sharedAlbums.map(renderSharedRow)}
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
                  本棚がありません。{'\n'}「本棚」セクションから先に本棚を作成してください。
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

      <ShareAlbumModal
        album={pendingAlbum}
        onClose={() => setPendingAlbum(null)}
      />

      <ManageSharesModal
        album={manageTarget}
        onClose={() => setManageTarget(null)}
      />

      <AcceptShareModal
        visible={showShareCodeModal}
        onClose={() => setShowShareCodeModal(false)}
        onAccepted={fetchData}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.paper },
  scrollContent: { paddingBottom: SPACING.xxxl },

  acceptBtn: {
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.thumb,
    alignItems: 'center',
  },
  acceptBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: COLORS.accent,
    letterSpacing: 0.5,
  },

  empty: {
    paddingVertical: SPACING.huge,
    paddingHorizontal: SPACING.xxxl,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  emptyText: { ...TYPE.body, textAlign: 'center' },
  emptySubtext: { ...TYPE.caption, color: COLORS.inkSoft, textAlign: 'center' },

  sectionDivider: {
    ...TYPE.meta,
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.xxl,
    marginBottom: SPACING.sm,
  },

  list: {
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.rule,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  cover: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLORS.paperDeep,
  },
  coverPlaceholder: { backgroundColor: COLORS.paperDeep },
  rowBody: { flex: 1, gap: 2 },
  rowDate: {
    fontFamily: FONTS.serif,
    fontSize: 12,
    color: COLORS.inkSub,
  },
  rowTitle: {
    fontFamily: FONTS.serif,
    fontSize: 16,
    color: COLORS.ink,
  },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center' },
  rowMeta: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: COLORS.inkSoft,
    letterSpacing: 0.5,
  },
  rowShelf: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: COLORS.inkSoft,
  },
  moreBtn: {
    padding: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  sealBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.seal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealText: {
    fontFamily: FONTS.serif,
    fontSize: 12,
    color: COLORS.paper,
  },

  // Modals
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(44,38,32,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxxl,
  },
  pickerModal: { width: '100%', backgroundColor: COLORS.paper, borderRadius: SPACING.sm, overflow: 'hidden' },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  pickerTitle: { fontFamily: FONTS.serif, fontSize: 16, color: COLORS.ink },
  cancelText: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.inkSub },
  pickerEmpty: { padding: SPACING.xxl, alignItems: 'center' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  pickerRowActive: { backgroundColor: COLORS.paperDeep },
  pickerRowText: { fontFamily: FONTS.serif, fontSize: 15, color: COLORS.ink },
  pickerRowSub: { fontFamily: FONTS.sans, fontSize: 12, color: COLORS.inkSoft },

  primaryBtn: {
    width: '100%',
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.thumb,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  primaryBtnText: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.white, letterSpacing: 1 },
  btnDisabled: { opacity: 0.45 },

})
