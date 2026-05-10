import React, { useState, useCallback, useRef } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Alert,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import { deletePhoto } from '../../lib/photoDelete'
import type { TmpStackParamList } from '../../types'

const COLORS = {
  background: '#FAFAF7',
  accent: '#8B7355',
  text: '#2C2C2C',
  subtext: '#9E9E9E',
  border: '#E0D9D0',
  warning: '#E67E22',
  danger: '#C0392B',
  desk: '#7AAB7A',
  sectionHeader: '#6B6B6B',
}

const ITEM_SIZE = (Dimensions.get('window').width - 48) / 2

type Nav = NativeStackNavigationProp<TmpStackParamList, 'TmpAlbum'>

type TmpPhoto = {
  id: string
  image_url: string
  taken_at: string
}

function daysRemaining(takenAt: string): number {
  const expires = new Date(takenAt).getTime() + 3 * 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((expires - Date.now()) / (1000 * 60 * 60 * 24)))
}

export default function TmpAlbumScreen() {
  const navigation = useNavigation<Nav>()
  const [photos, setPhotos] = useState<TmpPhoto[]>([])
  const [deskPhotos, setDeskPhotos] = useState<TmpPhoto[]>([])
  const [deskAlbumId, setDeskAlbumId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchPhotos = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

    const { data: tmpData, error: tmpError } = await supabase
      .from('photos')
      .select('id, image_url, taken_at')
      .eq('user_id', user.id)
      .is('album_id', null)
      .gte('taken_at', since)
      .order('taken_at', { ascending: false })

    if (tmpError) {
      console.error('TmpAlbumScreen fetch error:', tmpError.message)
    } else {
      setPhotos(tmpData ?? [])
    }

    // 机アルバムを取得
    const { data: deskAlbum } = await supabase
      .from('albums')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_desk', true)
      .single()

    const deskId = deskAlbum?.id ?? null
    setDeskAlbumId(deskId)

    if (deskId) {
      const { data: deskData } = await supabase
        .from('photos')
        .select('id, image_url, taken_at')
        .eq('album_id', deskId)
        .order('taken_at', { ascending: false })

      setDeskPhotos(deskData ?? [])
    } else {
      setDeskPhotos([])
    }
  }, [])

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

  const handleDelete = (photo: TmpPhoto) => {
    Alert.alert(
      'この写真を削除しますか？',
      'この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePhoto(photo.id, photo.image_url)
              setPhotos(prev => prev.filter(p => p.id !== photo.id))
              setDeskPhotos(prev => prev.filter(p => p.id !== photo.id))
            } catch (e) {
              console.error('deletePhoto error:', e)
              Alert.alert('エラー', '削除に失敗しました。もう一度お試しください。')
            }
          },
        },
      ]
    )
  }

  const navigateToDeskAlbum = () => {
    if (!deskAlbumId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(navigation.getParent() as any)?.navigate('AlbumTab', {
      screen: 'AlbumDetail',
      params: { albumId: deskAlbumId, albumTitle: '机' },
    })
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    )
  }

  const isEmpty = photos.length === 0 && deskPhotos.length === 0

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={isEmpty ? styles.emptyContainer : styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
      }
    >
      {isEmpty ? (
        <>
          <Text style={styles.emptyText}>机の上には何もありません</Text>
          <Text style={styles.emptySubtext}>カメラで写真を撮るとここに表示されます</Text>
        </>
      ) : (
        <>
          {photos.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionHeader}>メッセージ待ち</Text>
              <View style={styles.grid}>
                {photos.map(item => {
                  const days = daysRemaining(item.taken_at)
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.card}
                      onPress={() => navigation.navigate('WriteMessage', { photoId: item.id, imageUrl: item.image_url })}
                      onLongPress={() => handleDelete(item)}
                      activeOpacity={0.85}
                    >
                      <Image source={{ uri: item.image_url }} style={styles.thumbnail} resizeMode="cover" />
                      <View style={[styles.badge, days <= 1 && styles.badgeUrgent]}>
                        <Text style={styles.badgeText}>残り{days}日</Text>
                      </View>
                      <View style={styles.cardFooter}>
                        <Text style={styles.cardHint}>タップしてメッセージを書く</Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          )}

          {deskPhotos.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeader}>机の上</Text>
                <TouchableOpacity onPress={navigateToDeskAlbum}>
                  <Text style={styles.sectionLink}>すべて見る</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.grid}>
                {deskPhotos.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.card}
                    onPress={navigateToDeskAlbum}
                    onLongPress={() => handleDelete(item)}
                    activeOpacity={0.85}
                  >
                    <Image source={{ uri: item.image_url }} style={styles.thumbnail} resizeMode="cover" />
                    <View style={styles.badgeDesk}>
                      <Text style={styles.badgeText}>机</Text>
                    </View>
                    <View style={styles.cardFooter}>
                      <Text style={styles.cardHint}>タップして見る</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 24 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15, color: COLORS.text, marginBottom: 8, textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: COLORS.subtext, textAlign: 'center', lineHeight: 20 },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeader: { fontSize: 12, color: COLORS.sectionHeader, letterSpacing: 1, textTransform: 'uppercase' },
  sectionLink: { fontSize: 13, color: COLORS.accent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: {
    width: ITEM_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  thumbnail: { width: '100%', height: ITEM_SIZE },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeUrgent: { backgroundColor: COLORS.warning },
  badgeDesk: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: COLORS.desk,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  cardFooter: { padding: 8 },
  cardHint: { fontSize: 11, color: COLORS.subtext },
})
