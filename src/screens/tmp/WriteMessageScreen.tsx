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
import * as FileSystem from 'expo-file-system/legacy'
import * as MediaLibrary from 'expo-media-library'
import { decode } from 'base64-arraybuffer'
import { supabase } from '../../lib/supabase'
import { getCameraRollPreference } from '../../lib/cameraRollPreference'
import type { Album, CameraStackParamList } from '../../types'

const COLORS = {
  background: '#FAFAF7',
  accent: '#8B7355',
  text: '#2C2C2C',
  subtext: '#9E9E9E',
  border: '#E0D9D0',
  error: '#C0392B',
  selected: '#F5EFE6',
}

type WriteMessageRoute = RouteProp<CameraStackParamList, 'WriteMessage'>
type WriteMessageNav = NativeStackNavigationProp<CameraStackParamList, 'WriteMessage'>

export default function WriteMessageScreen() {
  const route = useRoute<WriteMessageRoute>()
  const navigation = useNavigation<WriteMessageNav>()
  const { localUri, latitude, longitude, takenAt } = route.params

  const [message, setMessage] = useState('')
  const [albums, setAlbums] = useState<Album[]>([])
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
    const { data } = await supabase
      .from('albums')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setAlbums(data ?? [])
    setLoadingAlbums(false)
  }

  const createAlbum = async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data, error } = await supabase
      .from('albums')
      .insert({ title: newAlbumName.trim(), user_id: user.id })
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

    let albumId = selectedAlbumId
    if (showNewAlbum) {
      if (!newAlbumName.trim()) {
        setError('アルバム名を入力してください')
        return
      }
      albumId = await createAlbum()
      if (!albumId) {
        setError('アルバムの作成に失敗しました')
        return
      }
    } else if (!albumId) {
      setError('アルバムを選択してください')
      return
    }

    setError('')
    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ログインが必要です')

      const fileUri = localUri.startsWith('file://') ? localUri : `file://${localUri}`
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: 'base64',
      })
      const fileName = `${user.id}/${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, decode(base64), { contentType: 'image/jpeg' })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName)

      const { data: photo, error: photoError } = await supabase
        .from('photos')
        .insert({
          album_id: albumId,
          user_id: user.id,
          image_url: publicUrl,
          latitude,
          longitude,
          taken_at: takenAt ?? new Date().toISOString(),
        })
        .select()
        .single()
      if (photoError || !photo) throw photoError ?? new Error('写真の保存に失敗しました')

      const { error: msgError } = await supabase.from('messages').insert({
        photo_id: photo.id,
        content: message.trim(),
        author_id: user.id,
        is_original: true,
      })
      if (msgError) throw msgError

      const pref = await getCameraRollPreference()
      if (pref === 'message_only') {
        const { status } = await MediaLibrary.requestPermissionsAsync()
        if (status === 'granted') await MediaLibrary.saveToLibraryAsync(localUri)
      }

      navigation.goBack()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '保存中にエラーが発生しました'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <Image source={{ uri: localUri }} style={styles.photo} resizeMode="cover" />

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
          <Text style={styles.label}>アルバムを選択</Text>
          {loadingAlbums ? (
            <ActivityIndicator color={COLORS.accent} style={{ marginTop: 8 }} />
          ) : (
            <>
              {albums.map(album => (
                <TouchableOpacity
                  key={album.id}
                  style={[
                    styles.albumRow,
                    selectedAlbumId === album.id && !showNewAlbum && styles.albumRowSelected,
                  ]}
                  onPress={() => { setSelectedAlbumId(album.id); setShowNewAlbum(false) }}
                >
                  <Text style={styles.albumRowText}>{album.title}</Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[styles.albumRow, showNewAlbum && styles.albumRowSelected]}
                onPress={() => { setShowNewAlbum(true); setSelectedAlbumId(null) }}
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
