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
  TextInput,
  Pressable,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import type { BookshelfStackParamList } from '../../types'

const COLORS = {
  background: '#FAFAF7',
  accent: '#8B7355',
  text: '#2C2C2C',
  subtext: '#9E9E9E',
  border: '#E0D9D0',
}

type Props = {
  navigation: NativeStackNavigationProp<BookshelfStackParamList, 'Bookshelf'>
}

type BookshelfCard = {
  id: string
  title: string
  albumCount: number
  coverUrl: string | null
}

export default function BookshelfScreen({ navigation }: Props) {
  const [bookshelves, setBookshelves] = useState<BookshelfCard[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: shelfData }, { data: albumData }] = await Promise.all([
      supabase
        .from('bookshelves')
        .select('id, title')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('albums')
        .select('id, bookshelf_id')
        .eq('user_id', user.id)
        .eq('is_desk', false)
        .not('bookshelf_id', 'is', null),
    ])

    if (!shelfData?.length) { setBookshelves([]); return }

    const albumIds = (albumData ?? []).map(a => a.id)
    const { data: photoData } = albumIds.length
      ? await supabase
          .from('photos')
          .select('album_id, image_url')
          .in('album_id', albumIds)
          .order('taken_at', { ascending: true })
      : { data: [] }

    const coverByAlbum: Record<string, string> = {}
    for (const p of photoData ?? []) {
      if (!coverByAlbum[p.album_id]) coverByAlbum[p.album_id] = p.image_url
    }

    const shelfStats: Record<string, { count: number; coverUrl: string | null }> = {}
    for (const a of albumData ?? []) {
      if (!a.bookshelf_id) continue
      if (!shelfStats[a.bookshelf_id]) shelfStats[a.bookshelf_id] = { count: 0, coverUrl: null }
      shelfStats[a.bookshelf_id].count++
      if (!shelfStats[a.bookshelf_id].coverUrl) {
        shelfStats[a.bookshelf_id].coverUrl = coverByAlbum[a.id] ?? null
      }
    }

    setBookshelves(shelfData.map(s => ({
      id: s.id,
      title: s.title,
      albumCount: shelfStats[s.id]?.count ?? 0,
      coverUrl: shelfStats[s.id]?.coverUrl ?? null,
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

  const handleCreateBookshelf = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase
        .from('bookshelves')
        .insert({ title: newName.trim(), user_id: user.id })
        .select('id, title')
        .single()
      if (error) throw error
      setBookshelves(prev => [{ id: data.id, title: data.title, albumCount: 0, coverUrl: null }, ...prev])
      setNewName('')
      setShowCreate(false)
    } catch (e) {
      Alert.alert('エラー', '作成に失敗しました。もう一度お試しください。')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = (shelf: BookshelfCard) => {
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
              const { error } = await supabase.from('bookshelves').delete().eq('id', shelf.id)
              if (error) throw error
              setBookshelves(prev => prev.filter(s => s.id !== shelf.id))
            } catch (e) {
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
      <FlatList
        data={bookshelves}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        ListHeaderComponent={
          <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)}>
            <Text style={styles.createBtnText}>＋ 新しい本棚を作成</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>本棚がありません</Text>
            <Text style={styles.emptySubtext}>上のボタンから本棚を作成してください</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('BookshelfDetail', { bookshelfId: item.id, bookshelfTitle: item.title })}
            onLongPress={() => handleDelete(item)}
            activeOpacity={0.8}
          >
            {item.coverUrl ? (
              <Image source={{ uri: item.coverUrl }} style={styles.cover} resizeMode="cover" />
            ) : (
              <View style={[styles.cover, styles.coverPlaceholder]}>
                <Text style={styles.placeholderIcon}>📚</Text>
              </View>
            )}
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.cardSub}>{item.albumCount}冊</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <Modal visible={showCreate} animationType="fade" transparent onRequestClose={() => setShowCreate(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowCreate(false)}>
          <Pressable style={styles.createModal}>
            <Text style={styles.modalTitle}>新しい本棚を作成</Text>
            <TextInput
              style={styles.input}
              placeholder="本棚の名前"
              placeholderTextColor={COLORS.subtext}
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.confirmBtn, (!newName.trim() || creating) && styles.btnDisabled]}
              onPress={handleCreateBookshelf}
              disabled={!newName.trim() || creating}
            >
              {creating
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.confirmBtnText}>作成する</Text>
              }
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 12 },
  createBtn: {
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 4,
  },
  createBtnText: { color: COLORS.accent, fontSize: 14, fontWeight: '500' },
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
    backgroundColor: '#EDE8E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: { fontSize: 28 },
  cardBody: { flex: 1, padding: 16, justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, color: COLORS.text, fontWeight: '500', lineHeight: 21 },
  cardSub: { fontSize: 12, color: COLORS.subtext },
  emptyWrap: { marginTop: 32, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 15, color: COLORS.text, textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: COLORS.subtext, textAlign: 'center', lineHeight: 20 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  createModal: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
  },
  confirmBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  confirmBtnText: { color: '#fff', fontSize: 14, fontWeight: '500' },
})
