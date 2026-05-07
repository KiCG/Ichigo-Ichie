import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native'
import MapView, { Marker, Callout, Region } from 'react-native-maps'
import * as Location from 'expo-location'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import type { HomeStackParamList } from '../../types'

const COLORS = {
  background: '#FAFAF7',
  accent: '#8B7355',
  text: '#2C2C2C',
  subtext: '#9E9E9E',
  border: '#E0D9D0',
}

const DISPLAY_RADIUS_KM = 5

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'Nearby'>
}

type NearbyPhoto = {
  id: string
  image_url: string
  latitude: number
  longitude: number
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function NearbyScreen({ navigation }: Props) {
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [photos, setPhotos] = useState<NearbyPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [permissionDenied, setPermissionDenied] = useState(false)

  const fetchNearbyPhotos = useCallback(async (coords: { latitude: number; longitude: number }) => {
    const { data } = await supabase
      .from('photos')
      .select('id, image_url, latitude, longitude')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    if (!data) return

    setPhotos(
      data.filter(p =>
        haversineKm(coords.latitude, coords.longitude, p.latitude, p.longitude) <= DISPLAY_RADIUS_KM
      )
    )
  }, [])

  useEffect(() => {
    const init = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setPermissionDenied(true)
        setLoading(false)
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
      setUserLocation(coords)
      await fetchNearbyPhotos(coords)
      setLoading(false)
    }
    init()
  }, [fetchNearbyPhotos])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingText}>現在地を取得中…</Text>
      </View>
    )
  }

  if (permissionDenied) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>位置情報へのアクセスを許可してください</Text>
      </View>
    )
  }

  const region: Region = {
    latitude: userLocation!.latitude,
    longitude: userLocation!.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={region} showsUserLocation showsMyLocationButton>
        {photos.map(photo => (
          <Marker
            key={photo.id}
            coordinate={{ latitude: photo.latitude, longitude: photo.longitude }}
          >
            <View style={styles.pin}>
              <Image source={{ uri: photo.image_url }} style={styles.pinImage} resizeMode="cover" />
            </View>
            <Callout onPress={() => navigation.navigate('UnlockCamera', { photoId: photo.id })}>
              <View style={styles.callout}>
                <Image source={{ uri: photo.image_url }} style={styles.calloutImage} resizeMode="cover" />
                <Text style={styles.calloutButton}>ここでロック解除する</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      <View style={styles.badge}>
        <Text style={styles.badgeText}>近くの思い出 {photos.length}件</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    gap: 12,
  },
  loadingText: { color: COLORS.subtext, fontSize: 13 },
  permissionText: {
    color: COLORS.text,
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 24,
  },
  map: { flex: 1 },
  pin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: COLORS.accent,
    overflow: 'hidden',
    backgroundColor: COLORS.border,
  },
  pinImage: { width: '100%', height: '100%' },
  callout: { width: 180, alignItems: 'center', paddingBottom: 4 },
  calloutImage: { width: 168, height: 110, borderRadius: 6, marginBottom: 8 },
  calloutButton: {
    fontSize: 13,
    color: COLORS.accent,
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  badgeText: { fontSize: 13, color: COLORS.text },
})
