import React, { useState, useEffect, useCallback } from 'react'
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
  Modal,
  ScrollView,
} from 'react-native'
import { supabase } from '../../lib/supabase'

const COLORS = {
  background: '#FAFAF7',
  accent: '#8B7355',
  text: '#2C2C2C',
  subtext: '#9E9E9E',
  border: '#E0D9D0',
  warning: '#E67E22',
}

const ITEM_SIZE = (Dimensions.get('window').width - 48) / 2

type TmpPhoto = {
  id: string
  image_url: string
  taken_at: string
  album_title: string | null
  message: string | null
}

function daysRemaining(takenAt: string): number {
  const expires = new Date(takenAt).getTime() + 3 * 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((expires - Date.now()) / (1000 * 60 * 60 * 24)))
}

export default function TmpAlbumScreen() {
  const [photos, setPhotos] = useState<TmpPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<TmpPhoto | null>(null)

  const fetchPhotos = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

    const { data: photosData, error: photosError } = await supabase
      .from('photos')
      .select('id, image_url, taken_at, album_id')
      .eq('user_id', user.id)
      .gte('taken_at', since)
      .order('taken_at', { ascending: false })

    if (photosError) {
      console.error('photos fetch error:', photosError.message)
      return
    }
    if (!photosData?.length) {
      setPhotos([])
      return
    }

    const photoIds = photosData.map(p => p.id)
    const albumIds = [...new Set(photosData.map(p => p.album_id).filter(Boolean))]

    const [{ data: messagesData }, { data: albumsData }] = await Promise.all([
      supabase.from('messages').select('photo_id, content').in('photo_id', photoIds).eq('is_original', true),
      supabase.from('albums').select('id, title').in('id', albumIds),
    ])

    const messageMap: Record<string, string> = Object.fromEntries(
      (messagesData ?? []).map(m => [m.photo_id, m.content])
    )
    const albumMap: Record<string, string> = Object.fromEntries(
      (albumsData ?? []).map(a => [a.id, a.title])
    )

    setPhotos(photosData.map(p => ({
      id: p.id,
      image_url: p.image_url,
      taken_at: p.taken_at,
      album_title: albumMap[p.album_id] ?? null,
      message: messageMap[p.id] ?? null,
    })))
  }, [])

  useEffect(() => {
    fetchPhotos().finally(() => setLoading(false))
  }, [fetchPhotos])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchPhotos()
    setRefreshing(false)
  }, [fetchPhotos])

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
          <Text style={styles.emptyText}>直近3日間の思い出はありません</Text>
          <Text style={styles.emptySubtext}>カメラで写真を撮ってメッセージを残しましょう</Text>
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
              <TouchableOpacity style={styles.card} onPress={() => setSelected(item)} activeOpacity={0.85}>
                <Image source={{ uri: item.image_url }} style={styles.thumbnail} resizeMode="cover" />
                <View style={[styles.badge, days <= 1 && styles.badgeUrgent]}>
                  <Text style={styles.badgeText}>残り{days}日</Text>
                </View>
                {item.message && (
                  <View style={styles.cardBody}>
                    <Text style={styles.messagePreview} numberOfLines={2}>{item.message}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          }}
        />
      )}

      <Modal
        visible={selected !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setSelected(null)}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setSelected(null)}>
          <View style={styles.modal}>
            {selected && (
              <>
                <Image source={{ uri: selected.image_url }} style={styles.modalImage} resizeMode="cover" />
                {selected.album_title && (
                  <Text style={styles.modalAlbum}>{selected.album_title}</Text>
                )}
                {selected.message ? (
                  <ScrollView style={styles.modalMessageScroll} bounces={false}>
                    <Text style={styles.modalMessage}>{selected.message}</Text>
                  </ScrollView>
                ) : (
                  <Text style={styles.modalNoMessage}>メッセージなし</Text>
                )}
                <View style={styles.modalFooter}>
                  <Text style={styles.modalDays}>
                    {daysRemaining(selected.taken_at) === 0
                      ? '本日削除されます'
                      : `残り${daysRemaining(selected.taken_at)}日で削除されます`}
                  </Text>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
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
  cardBody: { padding: 8 },
  messagePreview: { fontSize: 12, color: COLORS.text, lineHeight: 18 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modal: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalImage: { width: '100%', height: 280 },
  modalAlbum: {
    fontSize: 11,
    color: COLORS.subtext,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  modalMessageScroll: { maxHeight: 120 },
  modalMessage: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalNoMessage: {
    fontSize: 13,
    color: COLORS.subtext,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalDays: {
    fontSize: 12,
    color: COLORS.subtext,
    textAlign: 'center',
    paddingVertical: 12,
  },
})
