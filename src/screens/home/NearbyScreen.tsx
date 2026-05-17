import React, { useState, useEffect, useCallback, useRef } from 'react'
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
import MapView, { Marker, Callout, Region } from 'react-native-maps'
import Supercluster from 'supercluster'
import * as Location from 'expo-location'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import { COLORS, FONTS, SPACING, TYPE, RADIUS } from '../../theme'
import type { HomeStackParamList } from '../../types'

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
  unlock_at: string | null
  distanceKm: number
}

type PointFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: NearbyPhoto
}

type ClusterFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    cluster: true
    cluster_id: number
    point_count: number
  }
}

type MapFeature = PointFeature | ClusterFeature

function isCluster(f: MapFeature): f is ClusterFeature {
  return !!(f.properties as { cluster?: boolean }).cluster
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

function regionToZoom(region: Region): number {
  return Math.round(Math.log(360 / region.longitudeDelta) / Math.LN2)
}

export default function NearbyScreen({ navigation }: Props) {
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [nearbyPhotos, setNearbyPhotos] = useState<NearbyPhoto[]>([])
  const [displayClusters, setDisplayClusters] = useState<MapFeature[]>([])
  const [loading, setLoading] = useState(true)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [listVisible, setListVisible] = useState(false)

  const scRef = useRef<Supercluster<NearbyPhoto> | null>(null)
  const mapRef = useRef<MapView>(null)
  const regionRef = useRef<Region | null>(null)
  const zoomRef = useRef(10)

  // zoom 7→24px、zoom 13→48px でリニア補間し上下をクランプ
  const markerSize = Math.max(28, Math.min(48, (zoomRef.current - 7) * 4 + 24))

  const calcClusters = useCallback((region: Region) => {
    if (!scRef.current) return
    const bbox: [number, number, number, number] = [
      region.longitude - region.longitudeDelta / 2,
      region.latitude - region.latitudeDelta / 2,
      region.longitude + region.longitudeDelta / 2,
      region.latitude + region.latitudeDelta / 2,
    ]
    const zoom = Math.max(1, Math.min(regionToZoom(region), 20))
    zoomRef.current = zoom
    setDisplayClusters(scRef.current.getClusters(bbox, zoom) as MapFeature[])
  }, [])

  const fetchPhotos = useCallback(async (coords: { latitude: number; longitude: number }) => {
    const { data } = await supabase
      .from('photos')
      .select('id, image_url, latitude, longitude, unlock_at')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .not('album_id', 'is', null)

    if (!data) return

    const now = Date.now()
    const all = data
      .filter(p => !p.unlock_at || new Date(p.unlock_at).getTime() <= now)
      .map(p => ({
        id: p.id,
        image_url: p.image_url,
        latitude: p.latitude,
        longitude: p.longitude,
        unlock_at: p.unlock_at ?? null,
        distanceKm: haversineKm(coords.latitude, coords.longitude, p.latitude, p.longitude),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)

    // 近くの一覧（バッジ・ボトムシート用）
    setNearbyPhotos(all.filter(p => p.distanceKm <= DISPLAY_RADIUS_KM))

    // supercluster インデックスを全件で構築
    const sc = new Supercluster<NearbyPhoto>({ radius: 50, maxZoom: 15, minPoints: 2 })
    sc.load(all.map(p => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.longitude, p.latitude] },
      properties: p,
    })))
    scRef.current = sc

    if (regionRef.current) calcClusters(regionRef.current)
  }, [calcClusters])

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
      await fetchPhotos(coords)
      setLoading(false)
    }
    init()
  }, [fetchPhotos])

  const handleRegionChangeComplete = useCallback((region: Region) => {
    regionRef.current = region
    calcClusters(region)
  }, [calcClusters])

  const handleClusterPress = useCallback((feature: ClusterFeature) => {
    if (!scRef.current || !mapRef.current) return
    const expansionZoom = scRef.current.getClusterExpansionZoom(feature.properties.cluster_id)
    const [lng, lat] = feature.geometry.coordinates
    const newDelta = 360 / Math.pow(2, Math.min(expansionZoom + 1, 20))
    mapRef.current.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: newDelta, longitudeDelta: newDelta },
      400,
    )
  }, [])

  const handleSelectPhoto = (photoId: string) => {
    setListVisible(false)
    navigation.navigate('UnlockCamera', { photoId })
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingText}>現在地を確かめています…</Text>
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

  const initialRegion: Region = {
    latitude: userLocation!.latitude,
    longitude: userLocation!.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsMyLocationButton
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {userLocation && (
          <Marker
            coordinate={{ latitude: userLocation.latitude, longitude: userLocation.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={999}
          >
            <View style={styles.userDot} />
          </Marker>
        )}
        {displayClusters.map(feature => {
          const [lng, lat] = feature.geometry.coordinates

          if (isCluster(feature)) {
            const count = feature.properties.point_count
            const thumb = scRef.current
              ?.getLeaves(feature.properties.cluster_id, 1)[0]
              ?.properties?.image_url
            return (
              <Marker
                key={`cluster-${feature.properties.cluster_id}`}
                coordinate={{ latitude: lat, longitude: lng }}
                onPress={() => handleClusterPress(feature)}
                tracksViewChanges={false}
              >
                <View style={[styles.clusterWrap, { width: markerSize, height: markerSize }]}>
                  <View style={[styles.pinFrame, { width: markerSize, height: markerSize }]}>
                    {thumb
                      ? <Image source={{ uri: thumb }} style={styles.pinImage} resizeMode="cover" />
                      : <View style={[styles.pinImage, { backgroundColor: COLORS.paperDeep }]} />
                    }
                  </View>
                  <View style={styles.clusterBadge}>
                    <Text style={styles.clusterBadgeText}>{count > 99 ? '99+' : count}</Text>
                  </View>
                </View>
              </Marker>
            )
          }

          const photo = feature.properties
          return (
            <Marker
              key={photo.id}
              coordinate={{ latitude: lat, longitude: lng }}
              tracksViewChanges={false}
            >
              <View style={[styles.pinFrame, { width: markerSize, height: markerSize }]}>
                <Image source={{ uri: photo.image_url }} style={styles.pinImage} resizeMode="cover" />
              </View>
              <Callout onPress={() => handleSelectPhoto(photo.id)}>
                <View style={styles.callout}>
                  <Image source={{ uri: photo.image_url }} style={styles.calloutImage} resizeMode="cover" />
                  <Text style={styles.calloutButton}>ここでロック解除する</Text>
                </View>
              </Callout>
            </Marker>
          )
        })}
      </MapView>

      <TouchableOpacity
        style={styles.headerBadge}
        onPress={() => nearbyPhotos.length > 0 && setListVisible(true)}
        activeOpacity={nearbyPhotos.length > 0 ? 0.7 : 1}
      >
        <Text style={styles.headerBadgeText}>近くの思い出</Text>
        <Text style={styles.headerBadgeCount}>{nearbyPhotos.length}</Text>
      </TouchableOpacity>

      <Modal
        visible={listVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setListVisible(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setListVisible(false)}>
          <Pressable style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>この付近の思い出</Text>
            <Text style={styles.sheetCount}>{nearbyPhotos.length}件</Text>

            <FlatList
              data={nearbyPhotos}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.listItem}
                  onPress={() => handleSelectPhoto(item.id)}
                  activeOpacity={0.75}
                >
                  <Image source={{ uri: item.image_url }} style={styles.listThumb} resizeMode="cover" />
                  <View style={styles.listInfo}>
                    <Text style={styles.listDistance}>{formatDistance(item.distanceKm)}</Text>
                    <Text style={styles.listHint}>タップして訪ねる</Text>
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
  container: { flex: 1, backgroundColor: COLORS.paper },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.paper,
    paddingHorizontal: SPACING.xxxl,
    gap: SPACING.md,
  },
  loadingText: { ...TYPE.caption, color: COLORS.inkSoft },
  permissionText: { ...TYPE.body, textAlign: 'center', lineHeight: 24 },
  map: { flex: 1 },
  userDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(58, 74, 92, 0.55)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.85)',
  },

  // クラスターピン（写真サムネ＋件数バッジ）
  clusterWrap: {},
  clusterBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: COLORS.seal,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.paper,
  },
  clusterBadgeText: {
    fontFamily: FONTS.sans,
    fontSize: 10,
    color: COLORS.paper,
    fontWeight: '700',
  },

  // 写真サムネピン（紙の縁取り風）
  pinFrame: {
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.paper,
    backgroundColor: COLORS.paper,
    padding: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  pinImage: { width: '100%', height: '100%', borderRadius: 2 },

  callout: { width: 180, alignItems: 'center', paddingBottom: SPACING.xs },
  calloutImage: { width: 168, height: 110, borderRadius: RADIUS.thumb, marginBottom: SPACING.sm },
  calloutButton: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: COLORS.accent,
    fontWeight: '500',
  },

  headerBadge: {
    position: 'absolute',
    top: SPACING.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
    backgroundColor: COLORS.paper,
    borderRadius: 2,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  headerBadgeText: { fontFamily: FONTS.serif, fontSize: 15, color: COLORS.ink },
  headerBadgeCount: { fontFamily: FONTS.serif, fontSize: 18, color: COLORS.seal },

  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(44,38,32,0.35)',
  },
  sheet: {
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: SPACING.lg,
    borderTopRightRadius: SPACING.lg,
    maxHeight: SCREEN_HEIGHT * 0.7,
    paddingBottom: SPACING.xxxl,
  },
  sheetHandle: {
    width: 32,
    height: 3,
    backgroundColor: COLORS.rule,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  sheetTitle: { ...TYPE.title, fontSize: 20, paddingHorizontal: SPACING.xl },
  sheetCount: {
    ...TYPE.meta,
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  listContent: { paddingTop: SPACING.xs },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.rule,
    marginLeft: SPACING.xl + 60 + SPACING.lg,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    gap: SPACING.lg,
  },
  listThumb: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLORS.paperDeep,
  },
  listInfo: { flex: 1, gap: 3 },
  listDistance: { fontFamily: FONTS.serif, fontSize: 16, color: COLORS.ink },
  listHint: { ...TYPE.caption, color: COLORS.inkSoft },
  listArrow: { fontFamily: FONTS.sans, fontSize: 22, color: COLORS.inkSoft, fontWeight: '300' },
})
