import React, { useRef, useState } from 'react'
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  ActivityIndicator,
  Alert,
  PanResponder,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import * as Location from 'expo-location'
import * as MediaLibrary from 'expo-media-library'
import * as FileSystem from 'expo-file-system/legacy'
import { decode } from 'base64-arraybuffer'
import { supabase } from '../../lib/supabase'
import { getCameraRollPreference } from '../../lib/cameraRollPreference'
import { getAfterCapturePreference } from '../../lib/afterCapturePreference'
import { COLORS, FONTS, SPACING, RADIUS, TYPE } from '../../theme'
import type { CameraStackParamList } from '../../types'

type Props = {
  navigation: NativeStackNavigationProp<CameraStackParamList, 'Capture'>
}

// expo-camera の zoom prop は 0–1 スケール（0=最小、1=デバイス最大ズーム）
// ここでは "表示上の倍率" を 1–MAX_FACTOR で管理し、0–1 に変換して渡す
const MAX_ZOOM_FACTOR = 10
const factorToZoom = (f: number) => (f - 1) / (MAX_ZOOM_FACTOR - 1)

function formatFactor(f: number): string {
  const rounded = Math.round(f * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}×` : `${rounded.toFixed(1)}×`
}

export default function CaptureScreen({ navigation }: Props) {
  const cameraRef = useRef<CameraView>(null)
  const [capturing, setCapturing] = useState(false)
  const [facing, setFacing] = useState<'front' | 'back'>('back')
  const [zoomFactor, setZoomFactor] = useState(1)

  const pinchRef = useRef<{ distance: number; baseFactor: number } | null>(null)

  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions()
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions()

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
    onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
    onPanResponderGrant: (e) => {
      const t = e.nativeEvent.touches
      if (t.length === 2) {
        const dx = t[0].pageX - t[1].pageX
        const dy = t[0].pageY - t[1].pageY
        pinchRef.current = { distance: Math.sqrt(dx * dx + dy * dy), baseFactor: zoomFactor }
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
        setZoomFactor(newFactor)
      }
    },
    onPanResponderRelease: () => { pinchRef.current = null },
    onPanResponderTerminate: () => { pinchRef.current = null },
  })

  if (!cameraPermission) {
    return <View style={styles.container} />
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>思い出を残すにはカメラへのアクセスが必要です</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermission}>
          <Text style={styles.permissionButtonText}>許可する</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const takePicture = async () => {
    if (!cameraRef.current || capturing) return
    setCapturing(true)

    try {
      if (!locationPermission?.granted) {
        const { granted } = await requestLocationPermission()
        if (!granted) {
          Alert.alert('位置情報が必要です', '思い出の場所を記録するために位置情報へのアクセスを許可してください')
          return
        }
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('ログインが必要です')

      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 })
      if (!photo) throw new Error('撮影に失敗しました')

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })

      const pref = await getCameraRollPreference()
      if (pref === 'all') {
        if (!mediaPermission?.granted) {
          const { granted } = await requestMediaPermission()
          if (granted) await MediaLibrary.saveToLibraryAsync(photo.uri)
        } else {
          await MediaLibrary.saveToLibraryAsync(photo.uri)
        }
      }

      const fileUri = photo.uri.startsWith('file://') ? photo.uri : `file://${photo.uri}`
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' })
      const fileName = `${user.id}/${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, decode(base64), { contentType: 'image/jpeg' })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName)

      const { data: inserted, error: insertError } = await supabase.from('photos').insert({
        user_id: user.id,
        image_url: publicUrl,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        taken_at: new Date().toISOString(),
      }).select('id').single()
      if (insertError) throw insertError

      const shouldNavigate = await getAfterCapturePreference()
      if (shouldNavigate && inserted) {
        navigation.navigate('WriteMessage', { photoId: inserted.id, imageUrl: publicUrl })
      }
    } catch (e: unknown) {
      console.error('CaptureScreen error:', e)
      Alert.alert('エラー', '撮影中にエラーが発生しました')
    } finally {
      setCapturing(false)
    }
  }

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <CameraView
        style={styles.camera}
        facing={facing}
        zoom={factorToZoom(zoomFactor)}
        ref={cameraRef}
      />

      <View style={styles.controls}>
        <Text style={styles.zoomDisplay}>{formatFactor(zoomFactor)}</Text>

        <View style={styles.shutterRow}>
          <View style={styles.shutterSide} />

          <TouchableOpacity
            style={[styles.shutter, capturing && styles.shutterDisabled]}
            onPress={takePicture}
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
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: { flex: 1 },

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
    marginTop: SPACING.sm,
  },
  shutterSide: {
    flex: 1,
    alignItems: 'center',
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
  flipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.paper,
    paddingHorizontal: SPACING.xxxl,
    gap: SPACING.xxl,
  },
  permissionText: {
    ...TYPE.body,
    textAlign: 'center',
    lineHeight: 26,
  },
  permissionButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xxxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.thumb,
  },
  permissionButtonText: {
    color: COLORS.white,
    fontFamily: FONTS.sans,
    fontSize: 15,
    letterSpacing: 1,
  },
})
