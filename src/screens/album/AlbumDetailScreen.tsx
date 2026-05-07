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
import { useRoute, RouteProp } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import type { AlbumStackParamList } from '../../types'

const COLORS = {
  background: '#FAFAF7',
  accent: '#8B7355',
  text: '#2C2C2C',
  subtext: '#9E9E9E',
  border: '#E0D9D0',
}

const ITEM_SIZE = (Dimensions.get('window').width - 48) / 2

type AlbumDetailRoute = RouteProp<AlbumStackParamList, 'AlbumDetail'>

type PhotoItem = {
  id: string
  image_url: string
  taken_at: string
  message: string | null
}

export default function AlbumDetailScreen() {
  const route = useRoute<AlbumDetailRoute>()
  const { albumId } = route.params

  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<PhotoItem | null>(null)

  const fetchPhotos = useCallback(async () => {
    const { data: photoData } = await supabase
      .from('photos')
      .select('id, image_url, taken_at')
      .eq('album_id', albumId)
      .order('taken_at', { ascending: false })

    if (!photoData?.length) { setPhotos([]); return }

    const photoIds = photoData.map(p => p.id)
    const { data: msgData } = await supabase
      .from('messages')
      .select('photo_id, content')
      .in('photo_id', photoIds)
      .eq('is_original', true)

    const msgMap: Record<string, string> = Object.fromEntries(
      (msgData ?? []).map(m => [m.photo_id, m.content])
    )

    setPhotos(photoData.map(p => ({
      id: p.id,
      image_url: p.image_url,
      taken_at: p.taken_at,
      message: msgMap[p.id] ?? null,
    })))
  }, [albumId])

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
          <Text style={styles.emptyText}>このアルバムに写真はありません</Text>
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
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => setSelected(item)} activeOpacity={0.85}>
              <Image source={{ uri: item.image_url }} style={styles.thumbnail} resizeMode="cover" />
              {item.message && (
                <View style={styles.cardBody}>
                  <Text style={styles.messagePreview} numberOfLines={2}>{item.message}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
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
                {selected.message ? (
                  <ScrollView style={styles.modalMessageScroll} bounces={false}>
                    <Text style={styles.modalMessage}>{selected.message}</Text>
                  </ScrollView>
                ) : (
                  <Text style={styles.modalNoMessage}>メッセージなし</Text>
                )}
                <View style={styles.modalFooter}>
                  <Text style={styles.modalDate}>
                    {new Date(selected.taken_at).toLocaleDateString('ja-JP', {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })}
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
  emptyText: { fontSize: 15, color: COLORS.subtext, textAlign: 'center' },
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
  modalMessageScroll: { maxHeight: 140 },
  modalMessage: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 24,
    padding: 16,
  },
  modalNoMessage: {
    fontSize: 13,
    color: COLORS.subtext,
    padding: 16,
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalDate: { fontSize: 12, color: COLORS.subtext },
})
