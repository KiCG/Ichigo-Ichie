import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import * as MediaLibrary from 'expo-media-library'
import { supabase } from '../../lib/supabase'
import { getCameraRollPreference } from '../../lib/cameraRollPreference'
import type { Album, TmpStackParamList } from '../../types'

const COLORS = {
  background: '#FAFAF7',
  accent: '#8B7355',
  text: '#2C2C2C',
  subtext: '#9E9E9E',
  border: '#E0D9D0',
  error: '#C0392B',
  selected: '#F5EFE6',
  desk: '#E8F4E8',
  deskBorder: '#7AAB7A',
}

type WriteMessageRoute = RouteProp<TmpStackParamList, 'WriteMessage'>
type WriteMessageNav = NativeStackNavigationProp<TmpStackParamList, 'WriteMessage'>

export default function WriteMessageScreen() {
  const route = useRoute<WriteMessageRoute>()
  const navigation = useNavigation<WriteMessageNav>()
  const { photoId, imageUrl } = route.params

  const [message, setMessage] = useState('')
  const [albums, setAlbums] = useState<Album[]>([])
  const [deskAlbumId, setDeskAlbumId] = useState<string | null>(null)
  const [useDeskAlbum, setUseDeskAlbum] = useState(true)
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null)
  const [showNewAlbum, setShowNewAlbum] = useState(false)
  const [newAlbumName, setNewAlbumName] = useState('')
  const [loadingAlbums, setLoadingAlbums] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAlbums()
  }, [])

  const fetchAlbums = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 机アルバムを取得（なければ作成）
    let { data: desk } = await supabase
      .from('albums')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_desk', true)
      .single()

    if (!desk) {
      const { data: created } = await supabase
        .from('albums')
        .insert({ title: '机', user_id: user.id, is_desk: true })
        .select('id')
        .single()
      desk = created
    }
    setDeskAlbumId(desk?.id ?? null)

    // 通常アルバムのみ取得
    const { data: normalAlbums } = await supabase
      .from('albums')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_desk', false)
      .order('created_at', { ascending: false })

    setAlbums(normalAlbums ?? [])
    setLoadingAlbums(false)
  }

  const createAlbum = async (userId: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from('albums')
      .insert({ title: newAlbumName.trim(), user_id: userId })
      .select()
      .single()
    if (error || !data) return null
    return data.id
  }

  const handleSave = async () => {
    if (!message.trim()) {
      setError('メッセージを入力してください')
      return
    }
    if (showNewAlbum && !newAlbumName.trim()) {
      setError('アルバム名を入力してください')
      return
    }

    setError('')
    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ログインが必要です')

      let albumId: string | null = null
      if (useDeskAlbum) {
        albumId = deskAlbumId
        if (!albumId) throw new Error('机アルバムが見つかりません')
      } else if (showNewAlbum) {
        albumId = await createAlbum(user.id)
        if (!albumId) throw new Error('アルバムの作成に失敗しました')
      } else {
        albumId = selectedAlbumId
        if (!albumId) throw new Error('アルバムを選択してください')
      }

      const { error: updateError } = await supabase
        .from('photos')
        .update({ album_id: albumId })
        .eq('id', photoId)
      if (updateError) throw updateError

      const { error: msgError } = await supabase.from('messages').insert({
        photo_id: photoId,
        content: message.trim(),
        author_id: user.id,
        is_original: true,
      })
      if (msgError) throw msgError

      const pref = await getCameraRollPreference()
      if (pref === 'message_only') {
        const { status } = await MediaLibrary.requestPermissionsAsync()
        if (status === 'granted') await MediaLibrary.saveToLibraryAsync(imageUrl)
      }

      navigation.goBack()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '保存中にエラーが発生しました'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const selectDesk = () => {
    setUseDeskAlbum(true)
    setSelectedAlbumId(null)
    setShowNewAlbum(false)
  }

  const selectAlbum = (id: string) => {
    setUseDeskAlbum(false)
    setSelectedAlbumId(id)
    setShowNewAlbum(false)
  }

  const selectNewAlbum = () => {
    setUseDeskAlbum(false)
    setSelectedAlbumId(null)
    setShowNewAlbum(true)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <Image source={{ uri: imageUrl }} style={styles.photo} resizeMode="cover" />

        <View style={styles.section}>
          <Text style={styles.label}>メッセージ</Text>
          <TextInput
            style={styles.messageInput}
            placeholder="この場所での思いを残しましょう…"
            placeholderTextColor={COLORS.subtext}
            value={message}
            onChangeText={setMessage}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>保存先</Text>
          {loadingAlbums ? (
            <ActivityIndicator color={COLORS.accent} style={{ marginTop: 8 }} />
          ) : (
            <>
              <TouchableOpacity
                style={[styles.albumRow, styles.deskRow, useDeskAlbum && styles.deskRowSelected]}
                onPress={selectDesk}
              >
                <Text style={[styles.albumRowText, styles.deskRowText]}>机の上に置く</Text>
                <Text style={styles.deskRowSub}>後でアルバムに整理できます</Text>
              </TouchableOpacity>

              {albums.map(album => (
                <TouchableOpacity
                  key={album.id}
                  style={[
                    styles.albumRow,
                    !useDeskAlbum && selectedAlbumId === album.id && !showNewAlbum && styles.albumRowSelected,
                  ]}
                  onPress={() => selectAlbum(album.id)}
                >
                  <Text style={styles.albumRowText}>{album.title}</Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[styles.albumRow, !useDeskAlbum && showNewAlbum && styles.albumRowSelected]}
                onPress={selectNewAlbum}
              >
                <Text style={styles.albumRowText}>＋ 新しいアルバムを作成</Text>
              </TouchableOpacity>

              {showNewAlbum && (
                <TextInput
                  style={styles.albumNameInput}
                  placeholder="アルバム名"
                  placeholderTextColor={COLORS.subtext}
                  value={newAlbumName}
                  onChangeText={setNewAlbumName}
                  autoFocus
                />
              )}
            </>
          )}
        </View>

        {error !== '' && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveButtonText}>思い出を保存する</Text>
          }
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingBottom: 40 },
  photo: { width: '100%', height: 300 },
  section: { paddingHorizontal: 20, paddingTop: 24 },
  label: {
    fontSize: 12,
    color: COLORS.subtext,
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  messageInput: {
    minHeight: 120,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 12,
    lineHeight: 22,
  },
  albumRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    marginBottom: 8,
  },
  albumRowSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.selected,
  },
  albumRowText: { fontSize: 14, color: COLORS.text },
  deskRow: {
    borderColor: COLORS.deskBorder,
    backgroundColor: COLORS.desk,
  },
  deskRowSelected: {
    borderWidth: 2,
  },
  deskRowText: { fontWeight: '600' },
  deskRowSub: { fontSize: 12, color: COLORS.subtext, marginTop: 2 },
  albumNameInput: {
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 4,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 8,
  },
  error: {
    color: COLORS.error,
    fontSize: 13,
    marginTop: 12,
    marginHorizontal: 20,
    textAlign: 'center',
  },
  saveButton: {
    marginHorizontal: 20,
    marginTop: 24,
    height: 48,
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 15, letterSpacing: 1 },
})
