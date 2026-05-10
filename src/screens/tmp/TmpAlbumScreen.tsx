import React, { useState, useCallback, useRef } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  View,
  Text,
  FlatList,
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
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchPhotos = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('photos')
      .select('id, image_url, taken_at')
      .eq('user_id', user.id)
      .is('album_id', null)
      .gte('taken_at', since)
      .order('taken_at', { ascending: false })

    if (error) {
      console.error('TmpAlbumScreen fetch error:', error.message)
      return
    }

    setPhotos(data ?? [])
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
            } catch (e) {
              console.error('deletePhoto error:', e)
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
      {photos.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>メッセージを待っている写真はありません</Text>
          <Text style={styles.emptySubtext}>カメラで写真を撮るとここに表示されます</Text>
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
            const days = daysRemaining(item.taken_at)
            return (
              <TouchableOpacity
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
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: 15, color: COLORS.text, marginBottom: 8, textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: COLORS.subtext, textAlign: 'center', lineHeight: 20 },
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
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  cardFooter: {
    padding: 8,
  },
  cardHint: { fontSize: 11, color: COLORS.subtext },
})
