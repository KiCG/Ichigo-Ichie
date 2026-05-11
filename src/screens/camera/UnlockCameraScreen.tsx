import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Location from 'expo-location'
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import * as FileSystem from 'expo-file-system/legacy'
import { decode } from 'base64-arraybuffer'
import { supabase } from '../../lib/supabase'
import type { HomeStackParamList } from '../../types'

const COLORS = {
  background: '#FAFAF7',
  accent: '#8B7355',
  text: '#2C2C2C',
  subtext: '#9E9E9E',
  border: '#E0D9D0',
  error: '#C0392B',
  followUpBg: '#F0EDE8',
}

const UNLOCK_RADIUS_M = 100
const UNLOCK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

type UnlockRoute = RouteProp<HomeStackParamList, 'UnlockCamera'>
type UnlockNav = NativeStackNavigationProp<HomeStackParamList, 'UnlockCamera'>

type PhotoData = {
  id: string
  image_url: string
  latitude: number
  longitude: number
  message: string | null
}

type UnlockEntry = {
  unlockRecordId: string
  unlockedAt: string
  isActive: boolean
  message: { id: string; content: string } | null
}

type Step = 'loading' | 'tooFar' | 'ready' | 'checking' | 'unlocked' | 'failed'

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function UnlockCameraScreen() {
  const route = useRoute<UnlockRoute>()
  const navigation = useNavigation<UnlockNav>()
  const { photoId } = route.params

  const cameraRef = useRef<CameraView>(null)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()

  const [photo, setPhoto] = useState<PhotoData | null>(null)
  const [distance, setDistance] = useState<number | null>(null)
  const [step, setStep] = useState<Step>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [capturing, setCapturing] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [unlockEntries, setUnlockEntries] = useState<UnlockEntry[]>([])
  const [currentUnlockRecordId, setCurrentUnlockRecordId] = useState<string | null>(null)
  const [newFollowUp, setNewFollowUp] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchUnlockEntries = useCallback(async (pid: string, uid: string) => {
    const [{ data: unlockData }, { data: msgData }] = await Promise.all([
      supabase
        .from('unlock_records')
        .select('id, unlocked_at')
        .eq('user_id', uid)
        .eq('photo_id', pid)
        .order('unlocked_at', { ascending: true }),
      supabase
        .from('messages')
        .select('id, content, unlock_record_id')
        .eq('photo_id', pid)
        .eq('is_original', false),
    ])

    const msgByUnlock: Record<string, { id: string; content: string }> = {}
    for (const m of msgData ?? []) {
      if (m.unlock_record_id) msgByUnlock[m.unlock_record_id] = { id: m.id, content: m.content }
    }

    const now = Date.now()
    const entries: UnlockEntry[] = (unlockData ?? []).map(u => ({
      unlockRecordId: u.id,
      unlockedAt: u.unlocked_at,
      isActive: now - new Date(u.unlocked_at).getTime() <= UNLOCK_WINDOW_MS,
      message: msgByUnlock[u.id] ?? null,
    }))

    setUnlockEntries(entries)
    const active = entries.find(e => e.isActive)
    setCurrentUnlockRecordId(active?.unlockRecordId ?? null)
    setNewFollowUp(active?.message?.content ?? '')
  }, [])

  const init = useCallback(async () => {
    setStep('loading')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setStep('failed'); setErrorMessage('ログインが必要です'); return }
    setUserId(user.id)

    const { data: photoData } = await supabase
      .from('photos')
      .select('id, image_url, latitude, longitude')
      .eq('id', photoId)
      .single()

    if (!photoData) { setStep('failed'); setErrorMessage('写真が見つかりません'); return }

    const { data: msgData } = await supabase
      .from('messages')
      .select('content')
      .eq('photo_id', photoId)
      .eq('is_original', true)
      .single()

    setPhoto({
      id: photoData.id,
      image_url: photoData.image_url,
      latitude: photoData.latitude,
      longitude: photoData.longitude,
      message: msgData?.content ?? null,
    })

    const since = new Date(Date.now() - UNLOCK_WINDOW_MS).toISOString()
    const { data: existing } = await supabase
      .from('unlock_records')
      .select('id')
      .eq('user_id', user.id)
      .eq('photo_id', photoId)
      .gte('unlocked_at', since)
      .maybeSingle()

    if (existing) {
      await fetchUnlockEntries(photoId, user.id)
      setStep('unlocked')
      return
    }

    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') { setStep('failed'); setErrorMessage('位置情報の許可が必要です'); return }

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    const dist = Math.round(haversineM(
      loc.coords.latitude, loc.coords.longitude,
      photoData.latitude, photoData.longitude
    ))
    const gpsAccuracy = loc.coords.accuracy ?? 0
    setDistance(dist)
    setStep(dist - gpsAccuracy <= UNLOCK_RADIUS_M ? 'ready' : 'tooFar')
  }, [photoId, fetchUnlockEntries])

  useEffect(() => { init() }, [init])

  const handleCapture = async () => {
    if (!cameraRef.current || capturing || !photo) return
    setCapturing(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ログインが必要です')

      const taken = await cameraRef.current.takePictureAsync({ quality: 0.8 })
      if (!taken) throw new Error('撮影に失敗しました')

      setStep('checking')

      const fileUri = taken.uri.startsWith('file://') ? taken.uri : `file://${taken.uri}`
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' })
      const unlockPath = `unlocks/${user.id}/${photoId}-${Date.now()}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(unlockPath, decode(base64), { contentType: 'image/jpeg' })
      if (uploadError) throw uploadError

      const { data: { publicUrl: unlockUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(unlockPath)

      const { data: result, error: fnError } = await supabase.functions.invoke('check-image', {
        body: { originalImageUrl: photo.image_url, newImageUrl: unlockUrl },
      })
      if (fnError) throw fnError

      if (result?.matched) {
        await supabase.from('unlock_records').upsert({
          user_id: user.id,
          photo_id: photo.id,
          unlock_image_url: unlockUrl,
          unlocked_at: new Date().toISOString(),
        }, { onConflict: 'user_id,photo_id' })

        await fetchUnlockEntries(photo.id, user.id)
        setStep('unlocked')
      } else {
        setStep('failed')
        setErrorMessage('同じ場所から撮影されていないようです。もう一度試してみてください。')
      }
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : 'エラーが発生しました')
      setStep('failed')
    } finally {
      setCapturing(false)
    }
  }

  const handleSaveFollowUp = async () => {
    if (!newFollowUp.trim() || !photo || !userId || !currentUnlockRecordId) return
    setSaving(true)
    try {
      const activeEntry = unlockEntries.find(e => e.isActive)
      const existingMsg = activeEntry?.message ?? null

      if (existingMsg) {
        await supabase.from('messages').update({ content: newFollowUp.trim() }).eq('id', existingMsg.id)
      } else {
        await supabase.from('messages').insert({
          photo_id: photo.id,
          content: newFollowUp.trim(),
          author_id: userId,
          is_original: false,
          unlock_record_id: currentUnlockRecordId,
        })
      }
      await fetchUnlockEntries(photo.id, userId)
    } catch {
      // noop — user can retry
    } finally {
      setSaving(false)
    }
  }

  // --- Loading ---
  if (step === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.subtext}>確認中…</Text>
      </View>
    )
  }

  // --- Too far ---
  if (step === 'tooFar') {
    return (
      <View style={styles.center}>
        {photo && <Image source={{ uri: photo.image_url }} style={styles.hintImage} resizeMode="cover" />}
        <Text style={styles.sectionTitle}>この場所に近づいてください</Text>
        <Text style={styles.distanceText}>現在の距離: {distance}m（{UNLOCK_RADIUS_M}m 以内で解除可能）</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={init}>
          <Text style={styles.primaryButtonText}>現在地を再確認する</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // --- AI checking ---
  if (step === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.subtext}>AIが場所を確認しています…</Text>
      </View>
    )
  }

  // --- Unlocked ---
  if (step === 'unlocked' && photo) {
    const activeEntry = unlockEntries.find(e => e.isActive)
    const pastEntries = unlockEntries.filter(e => !e.isActive && e.message)

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.unlockedContainer}
          keyboardShouldPersistTaps="handled"
        >
          <Image source={{ uri: photo.image_url }} style={styles.unlockedImage} resizeMode="cover" />
          <View style={styles.unlockedBody}>

            <View>
              <Text style={styles.sectionLabel}>思い出のメッセージ</Text>
              <Text style={styles.unlockedMessage}>{photo.message ?? '（メッセージなし）'}</Text>
            </View>

            {pastEntries.length > 0 && (
              <View style={styles.followUpSection}>
                <Text style={styles.sectionLabel}>過去の訪問</Text>
                {pastEntries.map(e => (
                  <View key={e.unlockRecordId} style={styles.followUpItem}>
                    <Text style={styles.followUpDate}>
                      {new Date(e.unlockedAt).toLocaleDateString('ja-JP', {
                        year: 'numeric', month: 'long', day: 'numeric',
                      })}
                    </Text>
                    <Text style={styles.followUpContent}>{e.message!.content}</Text>
                  </View>
                ))}
              </View>
            )}

            {currentUnlockRecordId && (
              <View style={styles.appendSection}>
                <Text style={styles.sectionLabel}>
                  {activeEntry && new Date(activeEntry.unlockedAt).toLocaleDateString('ja-JP', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })} の記録
                </Text>
                <TextInput
                  style={styles.appendInput}
                  value={newFollowUp}
                  onChangeText={setNewFollowUp}
                  placeholder="今の気持ちを書き留めておく…"
                  placeholderTextColor={COLORS.subtext}
                  multiline
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={[styles.primaryButton, (!newFollowUp.trim() || saving) && styles.buttonDisabled]}
                  onPress={handleSaveFollowUp}
                  disabled={!newFollowUp.trim() || saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.primaryButtonText}>
                        {activeEntry?.message ? '更新する' : '保存する'}
                      </Text>
                  }
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>閉じる</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    )
  }

  // --- Failed ---
  if (step === 'failed') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{errorMessage || 'ロック解除に失敗しました'}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => { setErrorMessage(''); setStep('ready') }}>
          <Text style={styles.primaryButtonText}>もう一度試す</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>マップに戻る</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // --- Ready: camera ---
  if (!cameraPermission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.sectionTitle}>カメラへのアクセスを許可してください</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestCameraPermission}>
          <Text style={styles.primaryButtonText}>許可する</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" ref={cameraRef} />

      {photo && (
        <Image source={{ uri: photo.image_url }} style={styles.referenceImage} resizeMode="cover" />
      )}

      <View style={styles.hintBanner}>
        <Text style={styles.hintBannerText}>同じ場所から撮影してロック解除</Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.shutter, capturing && styles.shutterDisabled]}
          onPress={handleCapture}
          disabled={capturing}
        >
          {capturing
            ? <ActivityIndicator color="#fff" size="small" />
            : <View style={styles.shutterInner} />
          }
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: 32,
    gap: 16,
  },
  subtext: { color: COLORS.subtext, fontSize: 13 },
  sectionTitle: { fontSize: 17, color: COLORS.text, fontWeight: '600', textAlign: 'center' },
  sectionLabel: {
    fontSize: 11,
    color: COLORS.subtext,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  distanceText: { fontSize: 13, color: COLORS.subtext, textAlign: 'center' },
  errorText: { fontSize: 14, color: COLORS.error, textAlign: 'center', lineHeight: 22 },
  linkText: { fontSize: 13, color: COLORS.subtext, textDecorationLine: 'underline' },
  hintImage: { width: '100%', height: 200, borderRadius: 8 },
  primaryButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 32,
    paddingVertical: 13,
    borderRadius: 4,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  primaryButtonText: { color: '#fff', fontSize: 14, letterSpacing: 1 },
  camera: { flex: 1 },
  referenceImage: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 90,
    height: 60,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
    opacity: 0.85,
  },
  hintBanner: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 120,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  hintBannerText: { color: '#fff', fontSize: 12 },
  controls: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: { opacity: 0.5 },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  unlockedContainer: { backgroundColor: COLORS.background, flexGrow: 1 },
  unlockedImage: { width: '100%', height: 300 },
  unlockedBody: { padding: 24, gap: 20 },
  unlockedMessage: { fontSize: 16, color: COLORS.text, lineHeight: 28 },
  followUpSection: {
    gap: 8,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  followUpItem: {
    backgroundColor: COLORS.followUpBg,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  followUpDate: { fontSize: 11, color: COLORS.subtext },
  followUpContent: { fontSize: 14, color: COLORS.text, lineHeight: 22 },
  appendSection: {
    gap: 10,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  appendInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: COLORS.text,
    minHeight: 100,
    backgroundColor: '#fff',
  },
  closeButton: { alignItems: 'center', paddingVertical: 4 },
  closeButtonText: { fontSize: 13, color: COLORS.subtext, textDecorationLine: 'underline' },
})
