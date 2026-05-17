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
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { COLORS, FONTS, SPACING, TYPE, RADIUS } from '../../theme'
import type { MemoriesStackParamList } from '../../types'

type Props = {
  navigation: NativeStackNavigationProp<MemoriesStackParamList, 'Bookshelf'>
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
    } catch {
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
    <View style={styles.container}>
      <FlatList
        data={bookshelves}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        ListHeaderComponent={
          <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)} activeOpacity={0.7}>
            <Text style={styles.createBtnText}>＋ 新しい本棚をつくる</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>本棚はまだありません</Text>
            <Text style={styles.emptySubtext}>本棚をつくると、アルバムをまとめておけます</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('BookshelfDetail', { bookshelfId: item.id, bookshelfTitle: item.title })}
            activeOpacity={0.7}
          >
            {item.coverUrl ? (
              <Image source={{ uri: item.coverUrl }} style={styles.cover} resizeMode="cover" />
            ) : (
              <View style={[styles.cover, styles.coverPlaceholder]} />
            )}
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.rowMeta}>{item.albumCount}冊</Text>
            </View>
            <TouchableOpacity style={styles.moreBtn} onPress={() => handleDelete(item)} hitSlop={8}>
              <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.inkSoft} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />

      <Modal visible={showCreate} animationType="fade" transparent onRequestClose={() => setShowCreate(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowCreate(false)}>
          <Pressable style={styles.createModal}>
            <Text style={styles.modalTitle}>新しい本棚をつくる</Text>
            <TextInput
              style={styles.input}
              placeholder="本棚の名前"
              placeholderTextColor={COLORS.inkSoft}
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
                ? <ActivityIndicator color={COLORS.white} size="small" />
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
  container: { flex: 1, backgroundColor: COLORS.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.paper },
  list: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.huge },

  createBtn: {
    paddingVertical: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.thumb,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  createBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: COLORS.accent,
    letterSpacing: 0.5,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.lg,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.rule,
  },
  cover: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLORS.paperDeep,
  },
  coverPlaceholder: { backgroundColor: COLORS.paperDeep },
  rowBody: { flex: 1, gap: SPACING.xs },
  rowTitle: {
    fontFamily: FONTS.serif,
    fontSize: 17,
    color: COLORS.ink,
  },
  rowMeta: { ...TYPE.meta },
  moreBtn: {
    padding: SPACING.sm,
    marginLeft: SPACING.xs,
  },

  emptyWrap: { paddingTop: SPACING.huge, alignItems: 'center', gap: SPACING.sm },
  emptyText: { ...TYPE.body, textAlign: 'center' },
  emptySubtext: { ...TYPE.caption, color: COLORS.inkSoft, textAlign: 'center' },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(44,38,32,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxxl,
  },
  createModal: {
    width: '100%',
    backgroundColor: COLORS.paper,
    borderRadius: SPACING.sm,
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  modalTitle: {
    fontFamily: FONTS.serif,
    fontSize: 17,
    color: COLORS.ink,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
    borderRadius: RADIUS.thumb,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.ink,
    backgroundColor: COLORS.white,
  },
  confirmBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.thumb,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  confirmBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.white,
    letterSpacing: 1,
  },
})
