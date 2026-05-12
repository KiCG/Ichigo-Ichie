import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MapView, { Marker, Callout, Region } from 'react-native-maps'
import * as Location from 'expo-location'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import type { HomeStackParamList } from '../../types'

const parchmentRing = require('../../../assets/home/home_assets/parchment.png')
const sealIntact = require('../../../assets/home/home_assets/seal_intact.png')

const ANTIQUE_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f2e8d5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4a3728' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f2e8d5' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#b8a898' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#9e8e7e' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#e8dcc8' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#ede4d2' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#ddd3be' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#7a6a5a' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#c8d4b0' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6a8050' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ddd0b8' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#c8b89a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#d4c4a0' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#c8a878' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#b09060' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#7a6858' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#c8b898' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#ddd3be' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#a8c4be' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#6a8880' }] },
]

const COLORS = {
  background: '#FAFAF7',
  accent: '#8B7355',
  text: '#2C2C2C',
  subtext: '#9E9E9E',
  border: '#E0D9D0',
}

const DISPLAY_RADIUS_KM = 5
const SCREEN_HEIGHT = Dimensions.get('window').height

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'Nearby'>
}

type NearbyPhoto = {
  id: string
  image_url: string
  latitude: number
  longitude: number
  distanceKm: number
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

function formatDistance(km: number): string {
  if (km < 1) return `約 ${Math.round(km * 1000)}m`
  return `約 ${km.toFixed(1)}km`
}

export default function NearbyScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets()
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [photos, setPhotos] = useState<NearbyPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [listVisible, setListVisible] = useState(false)

  const fetchNearbyPhotos = useCallback(async (coords: { latitude: number; longitude: number }) => {
    const { data } = await supabase
      .from('photos')
      .select('id, image_url, latitude, longitude')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .not('album_id', 'is', null)

    if (!data) return

    const nearby = data
      .map(p => ({
        id: p.id,
        image_url: p.image_url,
        latitude: p.latitude,
        longitude: p.longitude,
        distanceKm: haversineKm(coords.latitude, coords.longitude, p.latitude, p.longitude),
      }))
      .filter(p => p.distanceKm <= DISPLAY_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)

    setPhotos(nearby)
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

  const handleSelectPhoto = (photoId: string) => {
    setListVisible(false)
    navigation.navigate('UnlockCamera', { photoId })
  }

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
      <MapView
        style={styles.map}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton
        customMapStyle={ANTIQUE_MAP_STYLE}
      >
        {photos.map(photo => (
          <Marker
            key={photo.id}
            coordinate={{ latitude: photo.latitude, longitude: photo.longitude }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.pin}>
              <Image source={{ uri: photo.image_url }} style={styles.pinPhoto} resizeMode="cover" />
              <Image source={parchmentRing} style={styles.pinRing} resizeMode="contain" />
              <Image source={sealIntact} style={styles.pinSeal} resizeMode="contain" />
            </View>
            <Callout onPress={() => handleSelectPhoto(photo.id)}>
              <View style={styles.callout}>
                <Image source={{ uri: photo.image_url }} style={styles.calloutImage} resizeMode="cover" />
                <Text style={styles.calloutButton}>ここでロック解除する</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      <TouchableOpacity
        style={[styles.badge, { top: insets.top + 12 }]}
        onPress={() => photos.length > 0 && setListVisible(true)}
        activeOpacity={photos.length > 0 ? 0.7 : 1}
      >
        <Text style={styles.badgeText}>近くの思い出 {photos.length}件</Text>
        {photos.length > 0 && <Text style={styles.badgeChevron}>›</Text>}
      </TouchableOpacity>

      {/* Photo list bottom sheet */}
      <Modal
        visible={listVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setListVisible(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setListVisible(false)}>
          <Pressable style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>この付近の思い出 {photos.length}件</Text>

            <FlatList
              data={photos}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.listItem}
                  onPress={() => handleSelectPhoto(item.id)}
                  activeOpacity={0.75}
                >
                  <View style={styles.thumbWrapper}>
                    <Image
                      source={{ uri: item.image_url }}
                      style={styles.listThumb}
                      resizeMode="cover"
                    />
                  </View>
                  <View style={styles.listInfo}>
                    <Text style={styles.listDistance}>{formatDistance(item.distanceKm)}</Text>
                    <Text style={styles.listHint}>タップしてロック解除へ</Text>
                  </View>
                  <Text style={styles.listArrow}>›</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
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
    width: 64,
    height: 64,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinPhoto: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 26,
  },
  pinRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 64,
    height: 64,
  },
  pinSeal: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
  },
  callout: { width: 180, alignItems: 'center', paddingBottom: 4 },
  calloutImage: { width: 168, height: 110, borderRadius: 6, marginBottom: 8 },
  calloutButton: { fontSize: 13, color: COLORS.accent, fontWeight: '600' },
  badge: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  badgeText: { fontSize: 13, color: COLORS.text },
  badgeChevron: { fontSize: 16, color: COLORS.accent, lineHeight: 18 },

  // Bottom sheet
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.65,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  listContent: { paddingVertical: 4 },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginLeft: 88,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 14,
  },
  thumbWrapper: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
  },
  listThumb: { width: '100%', height: '100%' },
  listInfo: { flex: 1, gap: 3 },
  listDistance: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  listHint: { fontSize: 12, color: COLORS.subtext },
  listArrow: { fontSize: 20, color: COLORS.subtext, lineHeight: 22 },
})
