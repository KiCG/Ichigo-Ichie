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
import { COLORS, FONTS, SPACING, TYPE, RADIUS } from '../../theme'
import type { MemoriesStackParamList } from '../../types'

const SCREEN_WIDTH = Dimensions.get('window').width
const PHOTO_SIZE = SCREEN_WIDTH - SPACING.xl * 2

type Nav = NativeStackNavigationProp<MemoriesStackParamList, 'TmpAll'>

type TmpPhoto = {
  id: string
  image_url: string
  taken_at: string
}

function daysRemaining(takenAt: string): number {
  const expires = new Date(takenAt).getTime() + 3 * 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((expires - Date.now()) / (1000 * 60 * 60 * 24)))
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
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
    } else {
      setPhotos(data ?? [])
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

  if (photos.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>現像待ちの写真はありません</Text>
        <Text style={styles.emptySubtext}>カメラで撮影した写真は、3日以内にメッセージを残してください。</Text>
      </View>
    )
  }

  return (
    <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
      >
        {photos.map((p, idx) => {
          const days = daysRemaining(p.taken_at)
          return (
            <View key={p.id} style={[styles.entry, idx === 0 && styles.entryFirst]}>
              <View style={styles.dateRow}>
                <Text style={styles.entryDate}>{formatDate(p.taken_at)}</Text>
                <Text style={[styles.days, days <= 1 && styles.daysUrgent]}>残り {days}日</Text>
              </View>

              <TouchableOpacity
                onPress={() => navigation.navigate('WriteMessage', { photoId: p.id, imageUrl: p.image_url })}
                onLongPress={() => handleDelete(p)}
                activeOpacity={0.92}
              >
                <Image source={{ uri: p.image_url }} style={styles.photo} resizeMode="cover" />
              </TouchableOpacity>

              <Text style={styles.hint}>タップしてメッセージを残す · 長押しで削除</Text>
            </View>
          )
        })}
      </ScrollView>

  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.paper },
  scroll: { paddingTop: SPACING.lg, paddingBottom: SPACING.huge },
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

  entry: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.huge,
    paddingBottom: SPACING.md,
  },
  entryFirst: { paddingTop: SPACING.xl },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  entryDate: { ...TYPE.date },
  days: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: COLORS.inkSub,
    letterSpacing: 0.5,
  },
  daysUrgent: { color: COLORS.seal },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLORS.paperDeep,
  },
  hint: {
    ...TYPE.caption,
    color: COLORS.inkSoft,
    marginTop: SPACING.md,
    fontStyle: 'italic',
  },

})
