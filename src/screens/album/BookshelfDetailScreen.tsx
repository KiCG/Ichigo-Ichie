import React, { useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import { COLORS, FONTS, SPACING, TYPE, RADIUS } from '../../theme'
import type { MemoriesStackParamList } from '../../types'

type AlbumCard = {
  id: string
  title: string
  coverUrl: string | null
  photoCount: number
  createdAt: string
}

type SharedAlbumCard = {
  id: string
  title: string
  coverUrl: string | null
  photoCount: number
  shareId: string
}

type Nav = NativeStackNavigationProp<MemoriesStackParamList, 'BookshelfDetail'>
type Route = RouteProp<MemoriesStackParamList, 'BookshelfDetail'>

function formatYearMonth(d: string): string {
  const date = new Date(d)
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

export default function BookshelfDetailScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const { bookshelfId } = route.params

  const [albums, setAlbums] = useState<AlbumCard[]>([])
  const [sharedAlbums, setSharedAlbums] = useState<SharedAlbumCard[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAlbums = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: albumData }, { data: shareData }] = await Promise.all([
      supabase
        .from('albums')
        .select('id, title, created_at')
        .eq('user_id', user.id)
        .eq('bookshelf_id', bookshelfId)
        .order('created_at', { ascending: false }),
      supabase
        .from('album_shares')
        .select('id, album_id')
        .eq('shared_to_user_id', user.id)
        .eq('recipient_bookshelf_id', bookshelfId),
    ])

    // Own albums
    const albumIds = (albumData ?? []).map(a => a.id)
    const sharedAlbumIds = (shareData ?? []).map(s => s.album_id)
    const allIds = [...albumIds, ...sharedAlbumIds]

    if (allIds.length === 0) {
      setAlbums([])
      setSharedAlbums([])
      return
    }

    const { data: photoData } = await supabase
      .from('photos')
      .select('id, album_id, image_url')
      .in('album_id', allIds)
      .order('taken_at', { ascending: true })

    const statsMap: Record<string, { count: number; coverUrl: string | null }> = {}
    for (const p of photoData ?? []) {
      if (!statsMap[p.album_id]) statsMap[p.album_id] = { count: 0, coverUrl: null }
      statsMap[p.album_id].count++
      if (!statsMap[p.album_id].coverUrl) statsMap[p.album_id].coverUrl = p.image_url
    }

    setAlbums((albumData ?? []).map(a => ({
      id: a.id,
      title: a.title,
      coverUrl: statsMap[a.id]?.coverUrl ?? null,
      photoCount: statsMap[a.id]?.count ?? 0,
      createdAt: a.created_at,
    })))

    if (sharedAlbumIds.length > 0) {
      const shareMap: Record<string, string> = {}
      for (const s of shareData ?? []) shareMap[s.album_id] = s.id

      const { data: sharedAlbumData } = await supabase
        .from('albums')
        .select('id, title')
        .in('id', sharedAlbumIds)

      setSharedAlbums((sharedAlbumData ?? []).map(a => ({
        id: a.id,
        title: a.title,
        coverUrl: statsMap[a.id]?.coverUrl ?? null,
        photoCount: statsMap[a.id]?.count ?? 0,
        shareId: shareMap[a.id],
      })))
    } else {
      setSharedAlbums([])
    }
  }, [bookshelfId])

  const isFirstLoad = useRef(true)

  useFocusEffect(
    useCallback(() => {
      if (isFirstLoad.current) {
        fetchAlbums().finally(() => { setLoading(false); isFirstLoad.current = false })
      } else {
        fetchAlbums()
      }
    }, [fetchAlbums])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchAlbums()
    setRefreshing(false)
  }, [fetchAlbums])

  const handleAlbumLongPress = (album: AlbumCard) => {
    Alert.alert(
      album.title,
      '',
      [
        {
          text: '本棚から外す',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('albums')
                .update({ bookshelf_id: null })
                .eq('id', album.id)
              if (error) throw error
              setAlbums(prev => prev.filter(a => a.id !== album.id))
            } catch (e) {
              console.error('removeFromBookshelf error:', e)
              Alert.alert('エラー', '操作に失敗しました。もう一度お試しください。')
            }
          },
        },
        {
          text: 'アルバムを削除',
          style: 'destructive',
          onPress: () => {
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
                        .from('albums')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('is_desk', true)
                        .single()
                      if (!deskAlbum) throw new Error('机アルバムが見つかりません')
                      await supabase.from('photos').update({ album_id: deskAlbum.id }).eq('album_id', album.id)
                      await supabase.from('albums').delete().eq('id', album.id)
                      setAlbums(prev => prev.filter(a => a.id !== album.id))
                    } catch (e) {
                      console.error('deleteAlbum error:', e)
                      Alert.alert('エラー', '削除に失敗しました。もう一度お試しください。')
                    }
                  },
                },
              ]
            )
          },
        },
        { text: 'キャンセル', style: 'cancel' },
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

  if (albums.length === 0 && sharedAlbums.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>この本棚にアルバムはありません</Text>
        <Text style={styles.emptySubtext}>片付けていないアルバムをここに移動できます</Text>
      </View>
    )
  }

  const handleSharedAlbumLongPress = (album: SharedAlbumCard) => {
    Alert.alert(album.title, '', [
      {
        text: '本棚から外す',
        onPress: async () => {
          try {
            await supabase.from('album_shares').update({ recipient_bookshelf_id: null }).eq('id', album.shareId)
            setSharedAlbums(prev => prev.filter(a => a.id !== album.id))
          } catch {
            Alert.alert('エラー', '操作に失敗しました。もう一度お試しください。')
          }
        },
      },
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

  return (
    <View style={styles.container}>
      <FlatList
        data={albums}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        ListFooterComponent={
          sharedAlbums.length > 0 ? (
            <>
              <Text style={styles.sectionDivider}>共有アルバム</Text>
              {sharedAlbums.map((item, index) => (
                <React.Fragment key={item.id}>
                  {index > 0 && <View style={styles.separator} />}
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => navigation.navigate('AlbumDetail', { albumId: item.id, albumTitle: item.title })}
                    onLongPress={() => handleSharedAlbumLongPress(item)}
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
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('AlbumDetail', { albumId: item.id, albumTitle: item.title })}
            onLongPress={() => handleAlbumLongPress(item)}
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
              <Text style={styles.rowMeta}>{item.photoCount}枚</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.paper },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxxl,
    gap: SPACING.sm,
    backgroundColor: COLORS.paper,
  },
  emptyText: { ...TYPE.body, textAlign: 'center' },
  emptySubtext: { ...TYPE.caption, color: COLORS.inkSoft, textAlign: 'center' },

  list: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.huge },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.lg,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.rule },
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
  rowMeta: { ...TYPE.meta },
  sectionDivider: {
    ...TYPE.meta,
    paddingHorizontal: 0,
    marginTop: SPACING.xxl,
    marginBottom: SPACING.sm,
  },
  chevron: {
    fontFamily: FONTS.sans,
    fontSize: 24,
    color: COLORS.inkSoft,
    fontWeight: '300',
  },
})
