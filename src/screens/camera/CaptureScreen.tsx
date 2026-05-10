import React, { useRef, useState } from 'react'
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Location from 'expo-location'
import * as MediaLibrary from 'expo-media-library'
import * as FileSystem from 'expo-file-system/legacy'
import { decode } from 'base64-arraybuffer'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import { getCameraRollPreference } from '../../lib/cameraRollPreference'
import type { CameraStackParamList } from '../../types'

type Props = {
  navigation: NativeStackNavigationProp<CameraStackParamList, 'Capture'>
}

export default function CaptureScreen({ navigation }: Props) {
  const cameraRef = useRef<CameraView>(null)
  const [capturing, setCapturing] = useState(false)

  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions()
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions()

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

      // カメラロール保存（all 設定時）
      const pref = await getCameraRollPreference()
      if (pref === 'all') {
        if (!mediaPermission?.granted) {
          const { granted } = await requestMediaPermission()
          if (granted) await MediaLibrary.saveToLibraryAsync(photo.uri)
        } else {
          await MediaLibrary.saveToLibraryAsync(photo.uri)
        }
      }

      // Storage にアップロード
      const fileUri = photo.uri.startsWith('file://') ? photo.uri : `file://${photo.uri}`
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' })
      const fileName = `${user.id}/${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, decode(base64), { contentType: 'image/jpeg' })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName)

      // photos テーブルに保存（album_id なし = tmp 状態）
      const { error: insertError } = await supabase.from('photos').insert({
        user_id: user.id,
        image_url: publicUrl,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        taken_at: new Date().toISOString(),
      })
      if (insertError) throw insertError

      // 撮影完了（画面はそのまま）
    } catch (e: unknown) {
      console.error('CaptureScreen error:', e)
      Alert.alert('エラー', '撮影中にエラーが発生しました')
    } finally {
      setCapturing(false)
    }
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" ref={cameraRef} />
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.shutter, capturing && styles.shutterDisabled]}
          onPress={takePicture}
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
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
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
  shutterDisabled: {
    opacity: 0.5,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 32,
  },
  permissionText: {
    color: '#fff',
    fontSize: 15,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: '#8B7355',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 4,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 15,
    letterSpacing: 1,
  },
})
