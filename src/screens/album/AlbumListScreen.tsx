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
  Modal,
  Pressable,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import type { AlbumStackParamList } from '../../types'

const COLORS = {
  background: '#FAFAF7',
  accent: '#8B7355',
  text: '#2C2C2C',
  subtext: '#9E9E9E',
  border: '#E0D9D0',
}

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

type ShelfOption = { id: string; title: string }

export default function AlbumListScreen({ navigation }: Props) {
  const [albums, setAlbums] = useState<AlbumCard[]>([])
  const [bookshelves, setBookshelves] = useState<ShelfOption[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [moveTarget, setMoveTarget] = useState<AlbumCard | null>(null)
  const [moving, setMoving] = useState(false)

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: albumData }, { data: shelfData }] = await Promise.all([
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
    ])

    setBookshelves(shelfData ?? [])

    if (!albumData?.length) { setAlbums([]); return }

    const shelfMap: Record<string, string> = {}
    for (const s of shelfData ?? []) shelfMap[s.id] = s.title

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
          } catch (e) {
            Alert.alert('エラー', '操作に失敗しました。')
          }
        },
      })
    }
    options.push({
      text: 'アルバムを削除',
      style: 'destructive',
      onPress: () => handleDeleteAlbum(album),
    })
    options.push({ text: 'キャンセル', style: 'cancel' })
    Alert.alert(album.title, '', options)
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
            } catch (e) {
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
    } catch (e) {
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

  return (
    <View style={styles.container}>
      {albums.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>アルバムがありません</Text>
          <Text style={styles.emptySubtext}>写真を撮ってメッセージを残すとアルバムが作られます</Text>
        </View>
      ) : (
        <FlatList
          data={albums}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
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
          )}
        />
      )}

      <Modal visible={moveTarget !== null} animationType="fade" transparent onRequestClose={() => setMoveTarget(null)}>
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
                <Text style={styles.emptySubtext}>本棚がありません。{'\n'}本棚タブから先に本棚を作成してください。</Text>
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
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  emptyText: { fontSize: 15, color: COLORS.text, textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: COLORS.subtext, textAlign: 'center', lineHeight: 20 },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cover: { width: 100, height: 100 },
  coverPlaceholder: {
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  pickerModal: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
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
})
