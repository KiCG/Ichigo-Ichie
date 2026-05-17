import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Dimensions,
  Pressable,
  PanResponder,
} from 'react-native'
import TextEditorModal from '../../components/TextEditorModal'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Location from 'expo-location'
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import * as FileSystem from 'expo-file-system/legacy'
import { decode } from 'base64-arraybuffer'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { COLORS, FONTS, SPACING, TYPE, RADIUS } from '../../theme'
import type { HomeStackParamList } from '../../types'

const UNLOCK_RADIUS_M = 100
const UNLOCK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const MAX_ZOOM_FACTOR = 10
const factorToZoom = (f: number) => (f - 1) / (MAX_ZOOM_FACTOR - 1)
function formatFactor(f: number): string {
  const r = Math.round(f * 10) / 10
  return Number.isInteger(r) ? `${r}×` : `${r.toFixed(1)}×`
}

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

type Step = 'loading' | 'tooFar' | 'ready' | 'checking' | 'unlocked' | 'failed' | 'memoryCapture'

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

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
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
  const [memoryImageUrl, setMemoryImageUrl] = useState<string | null>(null)
  const [memoryCapturing, setMemoryCapturing] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [showRefFull, setShowRefFull] = useState(false)

  const [facing, setFacing] = useState<'front' | 'back'>('back')
  const [zoomFactor, setZoomFactor] = useState(1)
  const zoomFactorRef = useRef(1)
  const pinchRef = useRef<{ distance: number; baseFactor: number } | null>(null)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
      onPanResponderGrant: (e) => {
        const t = e.nativeEvent.touches
        if (t.length === 2) {
          const dx = t[0].pageX - t[1].pageX
          const dy = t[0].pageY - t[1].pageY
          pinchRef.current = { distance: Math.sqrt(dx * dx + dy * dy), baseFactor: zoomFactorRef.current }
        }
      },
      onPanResponderMove: (e) => {
        const t = e.nativeEvent.touches
        if (t.length === 2 && pinchRef.current) {
          const dx = t[0].pageX - t[1].pageX
          const dy = t[0].pageY - t[1].pageY
          const dist = Math.sqrt(dx * dx + dy * dy)
          const scale = dist / pinchRef.current.distance
          const newFactor = Math.max(1, Math.min(MAX_ZOOM_FACTOR, pinchRef.current.baseFactor * scale))
          zoomFactorRef.current = newFactor
          setZoomFactor(newFactor)
        }
      },
      onPanResponderRelease: () => { pinchRef.current = null },
      onPanResponderTerminate: () => { pinchRef.current = null },
    })
  ).current

  const fetchUnlockEntries = useCallback(async (pid: string, uid: string) => {
    const [{ data: unlockData }, { data: msgData }] = await Promise.all([
      supabase
        .from('unlock_records')
        .select('id, unlocked_at, memory_image_url')
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

    const activeRaw = (unlockData ?? []).find(u =>
      now - new Date(u.unlocked_at).getTime() <= UNLOCK_WINDOW_MS
    )
    setMemoryImageUrl(activeRaw?.memory_image_url ?? null)
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

  const handleSaveFollowUp = async (textArg?: string) => {
    const content = (textArg ?? newFollowUp).trim()
    if (!content || !photo || !userId || !currentUnlockRecordId) return
    setSaving(true)
    try {
      const activeEntry = unlockEntries.find(e => e.isActive)
      const existingMsg = activeEntry?.message ?? null

      if (existingMsg) {
        await supabase.from('messages').update({ content }).eq('id', existingMsg.id)
      } else {
        await supabase.from('messages').insert({
          photo_id: photo.id,
          content,
          author_id: userId,
          is_original: false,
          unlock_record_id: currentUnlockRecordId,
        })
      }
      await fetchUnlockEntries(photo.id, userId)
    } catch {
      // noop
    } finally {
      setSaving(false)
    }
  }

  const handleMemoryCapture = async () => {
    if (!cameraRef.current || memoryCapturing || !currentUnlockRecordId || !userId) return
    setMemoryCapturing(true)
    try {
      const taken = await cameraRef.current.takePictureAsync({ quality: 0.8 })
      if (!taken) throw new Error('撮影に失敗しました')

      const fileUri = taken.uri.startsWith('file://') ? taken.uri : `file://${taken.uri}`
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' })
      const memPath = `unlocks/memory/${userId}/${currentUnlockRecordId}-${Date.now()}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(memPath, decode(base64), { contentType: 'image/jpeg' })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(memPath)

      await supabase.from('unlock_records')
        .update({ memory_image_url: publicUrl })
        .eq('id', currentUnlockRecordId)

      setMemoryImageUrl(publicUrl)
      setStep('unlocked')
    } catch {
      setStep('unlocked')
    } finally {
      setMemoryCapturing(false)
    }
  }

  if (step === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.subtext}>確かめています…</Text>
      </View>
    )
  }

  if (step === 'tooFar') {
    return (
      <View style={styles.center}>
        {photo && <Image source={{ uri: photo.image_url }} style={styles.hintImage} resizeMode="cover" />}
        <Text style={styles.sectionTitle}>この場所に近づいてください</Text>
        <Text style={styles.distanceText}>
          現在の距離 <Text style={styles.distanceNum}>{distance}m</Text>
          {'\n'}（{UNLOCK_RADIUS_M}m 以内で解錠できます）
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={init}>
          <Text style={styles.primaryButtonText}>現在地を確かめなおす</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (step === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.subtext}>同じ風景か確かめています…</Text>
      </View>
    )
  }

  if (step === 'unlocked' && photo) {
    const activeEntry = unlockEntries.find(e => e.isActive)
    const pastEntries = unlockEntries.filter(e => !e.isActive && e.message)

    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: COLORS.paper }}
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
              <View style={styles.quoteWrap}>
                <Text style={styles.quoteOpen}>「</Text>
                <Text style={styles.unlockedMessage}>{photo.message ?? '（メッセージなし）'}</Text>
                <Text style={styles.quoteClose}>」</Text>
              </View>
            </View>

            {pastEntries.length > 0 && (
              <View style={styles.followUpSection}>
                <Text style={styles.sectionLabel}>過去の訪問</Text>
                {pastEntries.map(e => (
                  <View key={e.unlockRecordId} style={styles.followUpItem}>
                    <Text style={styles.followUpDate}>{formatDate(e.unlockedAt)}</Text>
                    <Text style={styles.followUpContent}>{e.message!.content}</Text>
                  </View>
                ))}
              </View>
            )}

            {currentUnlockRecordId && activeEntry && (
              <View style={styles.appendSection}>
                <Text style={styles.sectionLabel}>
                  {formatDate(activeEntry.unlockedAt)} の記録
                </Text>

                {memoryImageUrl ? (
                  <Image source={{ uri: memoryImageUrl }} style={styles.memoryThumb} resizeMode="cover" />
                ) : (
                  <TouchableOpacity style={styles.addPhotoBtn} onPress={() => setStep('memoryCapture')} activeOpacity={0.7}>
                    <Ionicons name="camera-outline" size={16} color={COLORS.accent} />
                    <Text style={styles.addPhotoBtnText}>写真を残す</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.textTapArea}
                  onPress={() => setShowEditor(true)}
                  activeOpacity={0.7}
                >
                  {newFollowUp ? (
                    <Text style={styles.textPreview}>{newFollowUp}</Text>
                  ) : (
                    <Text style={styles.textPlaceholder}>今の気持ちを書き留めておく…</Text>
                  )}
                  <View style={styles.pencilWrap}>
                    {saving
                      ? <ActivityIndicator size="small" color={COLORS.inkSoft} />
                      : <Ionicons name="pencil-outline" size={13} color={COLORS.inkSoft} />
                    }
                  </View>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>閉じる</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>

        <TextEditorModal
          visible={showEditor}
          title="今の気持ち"
          placeholder="今の気持ちを書き留めておく…"
          initialValue={newFollowUp}
          onSave={(text) => {
            setNewFollowUp(text)
            setShowEditor(false)
            if (text.trim()) handleSaveFollowUp(text)
          }}
          onCancel={() => setShowEditor(false)}
          saving={saving}
        />
      </KeyboardAvoidingView>
    )
  }

  if (step === 'failed') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{errorMessage || 'ロック解除に失敗しました'}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => { setErrorMessage(''); setStep('ready') }}>
          <Text style={styles.primaryButtonText}>もう一度試す</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>地図に戻る</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (step === 'memoryCapture') {
    return (
      <View style={styles.container} {...panResponder.panHandlers}>
        <CameraView style={styles.camera} facing={facing} zoom={factorToZoom(zoomFactor)} ref={cameraRef} />
        <View style={styles.hintBanner}>
          <Text style={styles.hintBannerText}>今の景色を残す（任意）</Text>
        </View>
        <TouchableOpacity style={styles.memoryCancelBtn} onPress={() => setStep('unlocked')}>
          <Ionicons name="close" size={28} color={COLORS.paper} />
        </TouchableOpacity>
        <View style={styles.controls}>
          <Text style={styles.zoomDisplay}>{formatFactor(zoomFactor)}</Text>
          <View style={styles.shutterRow}>
            <View style={styles.shutterSide} />
            <TouchableOpacity
              style={[styles.shutter, memoryCapturing && styles.shutterDisabled]}
              onPress={handleMemoryCapture}
              disabled={memoryCapturing}
            >
              {memoryCapturing
                ? <ActivityIndicator color={COLORS.white} size="small" />
                : <View style={styles.shutterInner} />
              }
            </TouchableOpacity>
            <View style={styles.shutterSide}>
              <TouchableOpacity
                style={styles.flipButton}
                onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
              >
                <Ionicons name="camera-reverse-outline" size={28} color={COLORS.paper} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    )
  }

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

  const { width: SW, height: SH } = Dimensions.get('window')

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Modal visible={showRefFull} transparent animationType="fade" onRequestClose={() => setShowRefFull(false)}>
        <Pressable style={styles.refFullScreen} onPress={() => setShowRefFull(false)}>
          {photo && (
            <Image source={{ uri: photo.image_url }} style={{ width: SW, height: SH }} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.refFullCloseBtn} onPress={() => setShowRefFull(false)}>
            <Ionicons name="close" size={26} color={COLORS.paper} />
          </TouchableOpacity>
        </Pressable>
      </Modal>

      <CameraView style={styles.camera} facing={facing} zoom={factorToZoom(zoomFactor)} ref={cameraRef} />

      {photo && (
        <TouchableOpacity
          style={styles.referenceImage}
          onPress={() => setShowRefFull(true)}
          activeOpacity={0.85}
        >
          <Image source={{ uri: photo.image_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        </TouchableOpacity>
      )}

      <View style={styles.hintBanner}>
        <Text style={styles.hintBannerText}>同じ風景を撮ってロックを解錠</Text>
      </View>

      <View style={styles.controls}>
        <Text style={styles.zoomDisplay}>{formatFactor(zoomFactor)}</Text>
        <View style={styles.shutterRow}>
          <View style={styles.shutterSide} />
          <TouchableOpacity
            style={[styles.shutter, capturing && styles.shutterDisabled]}
            onPress={handleCapture}
            disabled={capturing}
          >
            {capturing
              ? <ActivityIndicator color={COLORS.white} size="small" />
              : <View style={styles.shutterInner} />
            }
          </TouchableOpacity>
          <View style={styles.shutterSide}>
            <TouchableOpacity
              style={styles.flipButton}
              onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
            >
              <Ionicons name="camera-reverse-outline" size={28} color={COLORS.paper} />
            </TouchableOpacity>
          </View>
        </View>
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
    backgroundColor: COLORS.paper,
    paddingHorizontal: SPACING.xxxl,
    gap: SPACING.lg,
  },
  subtext: { ...TYPE.caption, color: COLORS.inkSoft },
  sectionTitle: {
    fontFamily: FONTS.serif,
    fontSize: 18,
    color: COLORS.ink,
    textAlign: 'center',
  },
  sectionLabel: {
    ...TYPE.meta,
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
  },
  distanceText: { ...TYPE.caption, textAlign: 'center', lineHeight: 22 },
  distanceNum: {
    fontFamily: FONTS.serif,
    fontSize: 16,
    color: COLORS.ink,
  },
  errorText: {
    ...TYPE.body,
    color: COLORS.danger,
    textAlign: 'center',
  },
  linkText: {
    ...TYPE.caption,
    color: COLORS.inkSub,
    textDecorationLine: 'underline',
  },
  hintImage: {
    width: '100%',
    height: 220,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLORS.paperDeep,
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.thumb,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  primaryButtonText: {
    color: COLORS.white,
    fontFamily: FONTS.sans,
    fontSize: 14,
    letterSpacing: 1,
  },

  camera: { flex: 1 },
  referenceImage: {
    position: 'absolute',
    top: SPACING.lg,
    right: SPACING.lg,
    width: 96,
    height: 64,
    borderRadius: RADIUS.thumb,
    borderWidth: 2,
    borderColor: COLORS.paper,
    opacity: 0.92,
  },
  hintBanner: {
    position: 'absolute',
    top: SPACING.lg,
    left: SPACING.lg,
    right: 128,
    backgroundColor: 'rgba(44,38,32,0.55)',
    borderRadius: RADIUS.thumb,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  hintBannerText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: COLORS.paper,
  },
  controls: {
    position: 'absolute',
    bottom: SPACING.huge,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: SPACING.md,
  },
  zoomDisplay: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.paper,
    letterSpacing: 0.5,
    backgroundColor: 'rgba(80,80,80,0.6)',
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    overflow: 'hidden',
    textAlign: 'center',
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: SPACING.xxxl,
  },
  shutterSide: {
    flex: 1,
    alignItems: 'center',
  },
  flipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: COLORS.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: { opacity: 0.5 },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.paper,
  },

  unlockedContainer: { backgroundColor: COLORS.paper, flexGrow: 1 },
  unlockedImage: { width: '100%', height: 320 },
  unlockedBody: { padding: SPACING.xl, paddingBottom: SPACING.huge, gap: SPACING.xxl },
  quoteWrap: { marginTop: SPACING.xs },
  quoteOpen: {
    fontFamily: FONTS.serif,
    fontSize: 24,
    color: COLORS.inkSub,
    lineHeight: 24,
    marginBottom: -6,
  },
  quoteClose: {
    fontFamily: FONTS.serif,
    fontSize: 24,
    color: COLORS.inkSub,
    lineHeight: 24,
    textAlign: 'right',
    marginTop: -6,
  },
  unlockedMessage: {
    ...TYPE.bodySerif,
    fontSize: 17,
    paddingHorizontal: SPACING.md,
  },
  followUpSection: {
    gap: SPACING.sm,
    paddingTop: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.rule,
  },
  followUpItem: {
    backgroundColor: COLORS.paperDeep,
    padding: SPACING.md,
    gap: SPACING.xs,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.rule,
  },
  followUpDate: {
    fontFamily: FONTS.serif,
    fontSize: 13,
    color: COLORS.inkSub,
  },
  followUpContent: {
    ...TYPE.body,
    fontSize: 14,
    lineHeight: 22,
  },
  appendSection: {
    gap: SPACING.md,
    paddingTop: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.rule,
  },
  textTapArea: {
    minHeight: 90,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
    borderRadius: RADIUS.thumb,
    padding: SPACING.md,
    backgroundColor: COLORS.white,
  },
  textPreview: {
    fontFamily: FONTS.serif,
    fontSize: 15,
    color: COLORS.ink,
    lineHeight: 26,
  },
  textPlaceholder: {
    fontFamily: FONTS.serif,
    fontSize: 15,
    color: COLORS.inkSoft,
    fontStyle: 'italic',
  },
  pencilWrap: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
  },
  closeButton: { alignItems: 'center', paddingVertical: SPACING.xs },
  closeButtonText: {
    ...TYPE.caption,
    color: COLORS.inkSub,
    textDecorationLine: 'underline',
  },

  memoryThumb: {
    width: '100%',
    height: 200,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLORS.paperDeep,
  },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLORS.white,
  },
  addPhotoBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: COLORS.accent,
    letterSpacing: 0.3,
  },
  memoryCancelBtn: {
    position: 'absolute',
    top: SPACING.xl,
    left: SPACING.lg,
    padding: SPACING.sm,
  },

  refFullScreen: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refFullCloseBtn: {
    position: 'absolute',
    top: SPACING.xxl + 16,
    right: SPACING.xl,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: SPACING.sm,
  },
})
