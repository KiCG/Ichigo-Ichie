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
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import ShareAlbumModal from '../../components/ShareAlbumModal'
import ManageSharesModal from '../../components/ManageSharesModal'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import { COLORS, FONTS, SPACING, TYPE, RADIUS } from '../../theme'
import type { MemoriesStackParamList } from '../../types'

type Nav = NativeStackNavigationProp<MemoriesStackParamList, 'Memories'>

type TmpPhoto = { id: string; image_url: string; taken_at: string }
type DeskPhoto = { id: string; image_url: string }
type AlbumPreview = {
  id: string; title: string; coverUrl: string | null; photoCount: number
  bookshelfId: string | null; bookshelfTitle: string | null
}
type SharedAlbumPreview = {
  id: string; title: string; coverUrl: string | null; photoCount: number; shareId: string
}
type ShelfPreview = { id: string; title: string; albumCount: number; coverUrl: string | null }
type ShelfOption = { id: string; title: string }

const TMP_PREVIEW = 6
const DESK_PREVIEW = 4
const ALBUM_INITIAL = 2
const SHELF_INITIAL = 2

function daysRemaining(takenAt: string): number {
  const expires = new Date(takenAt).getTime() + 3 * 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((expires - Date.now()) / (1000 * 60 * 60 * 24)))
}

function SectionHeader({ title, onAll, hasMore, count }: {
  title: string; onAll: () => void; hasMore: boolean; count?: number
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hasMore && (
        <TouchableOpacity onPress={onAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.sectionAll}>
            {count !== undefined ? `すべて見る（${count}）` : 'すべて見る'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <View style={styles.emptyHint}>
      <Text style={styles.emptyHintText}>{text}</Text>
    </View>
  )
}

export default function MemoriesScreen() {
  const navigation = useNavigation<Nav>()
  const [tmpPhotos, setTmpPhotos] = useState<TmpPhoto[]>([])
  const [tmpCount, setTmpCount] = useState(0)
  const [deskPhotos, setDeskPhotos] = useState<DeskPhoto[]>([])
  const [deskCount, setDeskCount] = useState(0)
  const [albums, setAlbums] = useState<AlbumPreview[]>([])
  const [sharedAlbums, setSharedAlbums] = useState<SharedAlbumPreview[]>([])
  const [shelves, setShelves] = useState<ShelfPreview[]>([])
  const [allShelves, setAllShelves] = useState<ShelfOption[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [moveTarget, setMoveTarget] = useState<AlbumPreview | null>(null)
  const [moving, setMoving] = useState(false)
  const [shareTarget, setShareTarget] = useState<AlbumPreview | null>(null)
  const [manageTarget, setManageTarget] = useState<{ id: string; title: string } | null>(null)

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

    const [
      { data: tmpData },
      { count: tmpTotal },
      { data: deskAlbumData },
      { data: albumData },
      { data: shelfData },
      { data: shareData },
    ] = await Promise.all([
      supabase
        .from('photos')
        .select('id, image_url, taken_at')
        .eq('user_id', user.id)
        .is('album_id', null)
        .gte('taken_at', since)
        .order('taken_at', { ascending: false })
        .limit(TMP_PREVIEW),
      supabase
        .from('photos')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('album_id', null)
        .gte('taken_at', since),
      supabase
        .from('albums')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_desk', true)
        .maybeSingle(),
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

    setTmpPhotos(tmpData ?? [])
    setTmpCount(tmpTotal ?? 0)

    // Desk photos
    if (deskAlbumData) {
      const [{ data }, { count: total }] = await Promise.all([
        supabase
          .from('photos')
          .select('id, image_url')
          .eq('album_id', deskAlbumData.id)
          .order('taken_at', { ascending: false })
          .limit(DESK_PREVIEW),
        supabase
          .from('photos')
          .select('id', { count: 'exact', head: true })
          .eq('album_id', deskAlbumData.id),
      ])
      setDeskPhotos(data ?? [])
      setDeskCount(total ?? 0)
    } else {
      setDeskPhotos([])
      setDeskCount(0)
    }

    // Albums with cover + count
    const shelfMap: Record<string, string> = {}
    for (const s of shelfData ?? []) shelfMap[s.id] = s.title
    setAllShelves((shelfData ?? []).map(s => ({ id: s.id, title: s.title })))

    const albumIds = (albumData ?? []).map(a => a.id)
    const albumStats: Record<string, { url: string | null; count: number }> = {}
    if (albumIds.length > 0) {
      const { data: pData } = await supabase
        .from('photos')
        .select('album_id, image_url')
        .in('album_id', albumIds)
        .order('taken_at', { ascending: true })
      for (const p of pData ?? []) {
        if (!albumStats[p.album_id]) albumStats[p.album_id] = { url: null, count: 0 }
        if (!albumStats[p.album_id].url) albumStats[p.album_id].url = p.image_url
        albumStats[p.album_id].count++
      }
    }
    setAlbums((albumData ?? []).map(a => ({
      id: a.id,
      title: a.title,
      coverUrl: albumStats[a.id]?.url ?? null,
      photoCount: albumStats[a.id]?.count ?? 0,
      bookshelfId: a.bookshelf_id ?? null,
      bookshelfTitle: a.bookshelf_id ? (shelfMap[a.bookshelf_id] ?? null) : null,
    })))

    // Shelves with album count + cover
    const shelfIds = (shelfData ?? []).map(s => s.id)
    const shelfStats: Record<string, { count: number; coverUrl: string | null }> = {}
    if (shelfIds.length > 0) {
      const { data: aData } = await supabase
        .from('albums')
        .select('id, bookshelf_id')
        .in('bookshelf_id', shelfIds)
      const shelfAlbumIds = (aData ?? []).map(a => a.id)
      const albumToShelf: Record<string, string> = {}
      for (const a of aData ?? []) if (a.bookshelf_id) albumToShelf[a.id] = a.bookshelf_id

      const coverByAlbum: Record<string, string> = {}
      if (shelfAlbumIds.length > 0) {
        const { data: pData } = await supabase
          .from('photos')
          .select('album_id, image_url')
          .in('album_id', shelfAlbumIds)
          .order('taken_at', { ascending: true })
        for (const p of pData ?? []) {
          if (!coverByAlbum[p.album_id]) coverByAlbum[p.album_id] = p.image_url
        }
      }
      for (const a of aData ?? []) {
        const sid = a.bookshelf_id
        if (!sid) continue
        if (!shelfStats[sid]) shelfStats[sid] = { count: 0, coverUrl: null }
        shelfStats[sid].count++
        if (!shelfStats[sid].coverUrl) shelfStats[sid].coverUrl = coverByAlbum[a.id] ?? null
      }
    }
    setShelves((shelfData ?? []).map(s => ({
      id: s.id,
      title: s.title,
      albumCount: shelfStats[s.id]?.count ?? 0,
      coverUrl: shelfStats[s.id]?.coverUrl ?? null,
    })))

    // Shared albums received by the user
    if (shareData?.length) {
      const shareMap: Record<string, string> = {}
      const sharedAlbumIds: string[] = []
      for (const s of shareData) {
        shareMap[s.album_id] = s.id
        sharedAlbumIds.push(s.album_id)
      }
      const [{ data: saData }, { data: spData }] = await Promise.all([
        supabase.from('albums').select('id, title').in('id', sharedAlbumIds),
        supabase
          .from('photos')
          .select('album_id, image_url')
          .in('album_id', sharedAlbumIds)
          .order('taken_at', { ascending: true }),
      ])
      const sCoverMap: Record<string, string | null> = {}
      const sCountMap: Record<string, number> = {}
      for (const p of spData ?? []) {
        if (!sCoverMap[p.album_id]) sCoverMap[p.album_id] = p.image_url
        sCountMap[p.album_id] = (sCountMap[p.album_id] ?? 0) + 1
      }
      setSharedAlbums((saData ?? []).map(a => ({
        id: a.id,
        title: a.title,
        coverUrl: sCoverMap[a.id] ?? null,
        photoCount: sCountMap[a.id] ?? 0,
        shareId: shareMap[a.id],
      })))
    } else {
      setSharedAlbums([])
    }
  }, [])

  const isFirstLoad = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (isFirstLoad.current) {
        fetchAll().finally(() => { setLoading(false); isFirstLoad.current = false })
      } else {
        fetchAll()
      }
    }, [fetchAll])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchAll()
    setRefreshing(false)
  }, [fetchAll])

  const handleDeleteAlbum = (album: AlbumPreview) => {
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
      await supabase.from('albums').update({ bookshelf_id: bookshelfId }).eq('id', moveTarget.id)
      const shelf = allShelves.find(s => s.id === bookshelfId)
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

  const handleAlbumLongPress = (album: AlbumPreview) => {
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [
      { text: '共有する', onPress: () => setShareTarget(album) },
      { text: '共有を管理', onPress: () => setManageTarget(album) },
      { text: album.bookshelfId ? '別の本棚に移動' : '本棚に移動', onPress: () => setMoveTarget(album) },
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

  const handleSharedAlbumLongPress = (album: SharedAlbumPreview) => {
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

  const handleShelfLongPress = (shelf: ShelfPreview) => {
    Alert.alert(
      '本棚を削除しますか？',
      `「${shelf.title}」を削除します。\n中のアルバムは片付けていない状態に戻ります。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('bookshelves').delete().eq('id', shelf.id)
              setShelves(prev => prev.filter(s => s.id !== shelf.id))
            } catch {
              Alert.alert('エラー', '削除に失敗しました。もう一度お試しください。')
            }
          },
        },
      ]
    )
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    )
  }

  return (
    <>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
      }
    >
      {/* 現像待ち */}
      <SectionHeader
        title="現像待ち"
        onAll={() => navigation.navigate('TmpAll')}
        hasMore={tmpCount > 0}
        count={tmpCount}
      />
      {tmpPhotos.length === 0 ? (
        <EmptyHint text="新しい写真はありません。撮影するとここに現れます。" />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hList}
        >
          {tmpPhotos.map(p => {
            const days = daysRemaining(p.taken_at)
            return (
              <TouchableOpacity
                key={p.id}
                style={styles.tmpCard}
                onPress={() => navigation.navigate('WriteMessage', { photoId: p.id, imageUrl: p.image_url })}
                activeOpacity={0.85}
              >
                <Image source={{ uri: p.image_url }} style={styles.tmpThumb} resizeMode="cover" />
                <Text style={[styles.tmpDays, days <= 1 && styles.tmpDaysUrgent]}>
                  残り{days}日
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      {/* 机の上 */}
      <SectionHeader
        title="机の上"
        onAll={() => navigation.navigate('Desk')}
        hasMore={deskCount > 0}
        count={deskCount}
      />
      {deskPhotos.length === 0 ? (
        <EmptyHint text="机の上には何も置かれていません。" />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hList}
        >
          {deskPhotos.map(p => (
            <TouchableOpacity
              key={p.id}
              style={styles.deskCard}
              onPress={() => navigation.navigate('Desk')}
              activeOpacity={0.85}
            >
              <Image source={{ uri: p.image_url }} style={styles.deskThumb} resizeMode="cover" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* アルバム */}
      <SectionHeader
        title="アルバム"
        onAll={() => navigation.navigate('AlbumList')}
        hasMore={albums.length > 0}
        count={albums.length}
      />
      {albums.length === 0 ? (
        <EmptyHint text="写真にメッセージを残すとアルバムが綴られます。" />
      ) : (
        <View style={styles.vList}>
          {albums.slice(0, ALBUM_INITIAL).map(a => (
            <TouchableOpacity
              key={a.id}
              style={styles.albumRow}
              onPress={() => navigation.navigate('AlbumDetail', { albumId: a.id, albumTitle: a.title })}
              onLongPress={() => handleAlbumLongPress(a)}
              activeOpacity={0.7}
            >
              {a.coverUrl ? (
                <Image source={{ uri: a.coverUrl }} style={styles.albumCover} resizeMode="cover" />
              ) : (
                <View style={[styles.albumCover, styles.coverPlaceholder]} />
              )}
              <View style={styles.albumInfo}>
                <Text style={styles.albumTitle} numberOfLines={1}>{a.title}</Text>
                <Text style={styles.albumMeta}>{a.photoCount}枚</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 共有アルバム */}
      {sharedAlbums.length > 0 && (
        <>
          <SectionHeader
            title="共有アルバム"
            onAll={() => navigation.navigate('AlbumList')}
            hasMore={sharedAlbums.length > 0}
            count={sharedAlbums.length}
          />
          <View style={styles.vList}>
            {sharedAlbums.slice(0, ALBUM_INITIAL).map(a => (
              <TouchableOpacity
                key={a.id}
                style={styles.albumRow}
                onPress={() => navigation.navigate('AlbumDetail', { albumId: a.id, albumTitle: a.title })}
                onLongPress={() => handleSharedAlbumLongPress(a)}
                activeOpacity={0.7}
              >
                {a.coverUrl ? (
                  <Image source={{ uri: a.coverUrl }} style={styles.albumCover} resizeMode="cover" />
                ) : (
                  <View style={[styles.albumCover, styles.coverPlaceholder]} />
                )}
                <View style={styles.albumInfo}>
                  <Text style={styles.albumTitle} numberOfLines={1}>{a.title}</Text>
                  <Text style={styles.albumMeta}>{a.photoCount}枚 · 共有</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* 本棚 */}
      <SectionHeader
        title="本棚"
        onAll={() => navigation.navigate('Bookshelf')}
        hasMore={shelves.length > 0}
        count={shelves.length}
      />
      {shelves.length === 0 ? (
        <EmptyHint text="本棚をつくると、アルバムをまとめておけます。" />
      ) : (
        <View style={styles.vList}>
          {shelves.slice(0, SHELF_INITIAL).map(s => (
            <TouchableOpacity
              key={s.id}
              style={styles.albumRow}
              onPress={() => navigation.navigate('BookshelfDetail', { bookshelfId: s.id, bookshelfTitle: s.title })}
              onLongPress={() => handleShelfLongPress(s)}
              activeOpacity={0.7}
            >
              {s.coverUrl ? (
                <Image source={{ uri: s.coverUrl }} style={styles.albumCover} resizeMode="cover" />
              ) : (
                <View style={[styles.albumCover, styles.coverPlaceholder]} />
              )}
              <View style={styles.albumInfo}>
                <Text style={styles.albumTitle} numberOfLines={1}>{s.title}</Text>
                <Text style={styles.albumMeta}>{s.albumCount}冊</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ height: SPACING.huge }} />
    </ScrollView>

    <ShareAlbumModal
      album={shareTarget}
      onClose={() => setShareTarget(null)}
    />

    <ManageSharesModal
      album={manageTarget}
      onClose={() => setManageTarget(null)}
    />

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
              <Text style={styles.pickerCancel}>キャンセル</Text>
            </TouchableOpacity>
          </View>
          {allShelves.length === 0 ? (
            <View style={styles.pickerEmpty}>
              <Text style={styles.emptyHintText}>
                本棚がありません。{'\n'}先に本棚を作成してください。
              </Text>
            </View>
          ) : (
            allShelves.map(shelf => (
              <TouchableOpacity
                key={shelf.id}
                style={[
                  styles.pickerRow,
                  moveTarget?.bookshelfId === shelf.id && styles.pickerRowActive,
                ]}
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
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.paper },
  scroll: { paddingTop: SPACING.sm, paddingBottom: SPACING.xxxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.paper },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.xxl,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    ...TYPE.title,
    fontSize: 20,
  },
  sectionAll: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: COLORS.inkSub,
    letterSpacing: 0.5,
  },

  emptyHint: {
    marginHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
  },
  emptyHintText: {
    ...TYPE.caption,
    color: COLORS.inkSoft,
    textAlign: 'center',
  },

  // Horizontal lists (tmp, desk)
  hList: { paddingHorizontal: SPACING.xl, gap: SPACING.md },
  tmpCard: { gap: SPACING.xs, marginRight: SPACING.md },
  tmpThumb: {
    width: 120,
    height: 160,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLORS.paperDeep,
  },
  tmpDays: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: COLORS.inkSub,
    letterSpacing: 0.5,
  },
  tmpDaysUrgent: {
    color: COLORS.seal,
  },
  deskCard: { marginRight: SPACING.md },
  deskThumb: {
    width: 100,
    height: 100,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLORS.paperDeep,
  },

  // Vertical list (albums, shelves) — "綴じノート" style
  vList: {
    marginHorizontal: SPACING.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.rule,
  },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  albumCover: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLORS.paperDeep,
  },
  coverPlaceholder: { backgroundColor: COLORS.paperDeep },
  albumInfo: { flex: 1, gap: 2 },
  albumTitle: {
    fontFamily: FONTS.serif,
    fontSize: 16,
    color: COLORS.ink,
  },
  albumMeta: {
    ...TYPE.meta,
  },
  chevron: {
    fontFamily: FONTS.sans,
    fontSize: 24,
    color: COLORS.inkSoft,
    fontWeight: '300',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(44,38,32,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxxl,
  },
  pickerModal: {
    width: '100%',
    backgroundColor: COLORS.paper,
    borderRadius: SPACING.sm,
    overflow: 'hidden',
  },
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
  pickerCancel: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.inkSub },
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
  pickerEmpty: { padding: SPACING.xxl, alignItems: 'center' },

})
