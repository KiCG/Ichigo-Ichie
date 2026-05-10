import React, { useState, useEffect, useCallback } from 'react'
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
  navigation: NativeStackNavigationProp<AlbumStackParamList, 'Bookshelf'>
}

type AlbumCard = {
  id: string
  title: string
  coverUrl: string | null
  photoCount: number
}

export default function BookshelfScreen({ navigation }: Props) {
  const [albums, setAlbums] = useState<AlbumCard[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAlbums = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: albumData } = await supabase
      .from('albums')
      .select('id, title')
      .eq('user_id', user.id)
      .eq('is_desk', false)
      .order('created_at', { ascending: false })

    if (!albumData?.length) { setAlbums([]); return }

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
    })))
  }, [])

  useEffect(() => {
    fetchAlbums().finally(() => setLoading(false))
  }, [fetchAlbums])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchAlbums()
    setRefreshing(false)
  }, [fetchAlbums])

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
                .from('albums')
                .select('id')
                .eq('user_id', user.id)
                .eq('is_desk', true)
                .single()

              if (!deskAlbum) throw new Error('机アルバムが見つかりません')

              // 写真を机に移動してからアルバムを削除
              const { error: moveError } = await supabase
                .from('photos')
                .update({ album_id: deskAlbum.id })
                .eq('album_id', album.id)
              if (moveError) throw moveError

              const { error: deleteError } = await supabase
                .from('albums')
                .delete()
                .eq('id', album.id)
              if (deleteError) throw deleteError

              setAlbums(prev => prev.filter(a => a.id !== album.id))
            } catch (e) {
              console.error('deleteAlbum error:', e)
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
              onLongPress={() => handleDeleteAlbum(item)}
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
              </View>
            </TouchableOpacity>
          )}
        />
      )}
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
  cardBody: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  albumTitle: { fontSize: 16, color: COLORS.text, fontWeight: '500', lineHeight: 22 },
  photoCount: { fontSize: 12, color: COLORS.subtext },
})
