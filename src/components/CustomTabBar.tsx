import React from 'react'
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { scale, TAB_BAR_HEIGHT, FAB_SIZE } from '../lib/scale'
import { useCameraContext } from '../contexts/CameraContext'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const leatherBg = require('../../assets/home/home_assets/leather_transparent_cropped.png') as number
// eslint-disable-next-line @typescript-eslint/no-var-requires
const homeIcon = require('../../assets/home/home_assets/home.png') as number
// eslint-disable-next-line @typescript-eslint/no-var-requires
const collectionIcon = require('../../assets/home/home_assets/collection.png') as number
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cameraIcon = require('../../assets/home/home_assets/camera.png') as number
// eslint-disable-next-line @typescript-eslint/no-var-requires
const settingsIcon = require('../../assets/home/home_assets/settings.png') as number

const ICON_SIZE = Math.round(55 * scale)

// 横方向のみ縮小：画像を実際の幅より広く描画し、中央でクリップ
const SCREEN_WIDTH = Dimensions.get('window').width
const LEATHER_H_SCALE = 0.75          // 小さいほど横方向に縮小
const LEATHER_RENDER_WIDTH = Math.round(SCREEN_WIDTH / LEATHER_H_SCALE)
const LEATHER_LEFT = -Math.round((LEATHER_RENDER_WIDTH - SCREEN_WIDTH) / 2)

const TAB_ICONS = [homeIcon, collectionIcon, null, settingsIcon]

export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const bottomPad = Math.max(insets.bottom, 8)
  const { shootRef } = useCameraContext()
  const isOnCamera = state.routes[state.index]?.name === 'CameraTab'

  const handleFabPress = () => {
    if (isOnCamera && shootRef.current) {
      shootRef.current()
    } else {
      navigation.navigate('CameraTab')
    }
  }

  return (
    <View style={styles.wrapper}>
      {/* 革素材：bar + safe area spacer を含む wrapper 全体を縦にストレッチ */}
      <Image source={leatherBg} style={styles.leatherBg} resizeMode="stretch" />

      {/* Raised FAB camera button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleFabPress}
        activeOpacity={0.85}
      >
        <Image source={cameraIcon} style={styles.fabIcon} resizeMode="contain" />
      </TouchableOpacity>

      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          if (route.name === 'CameraTab') {
            return <View key={route.key} style={styles.fabSpacer} />
          }

          const isFocused = state.index === index
          const iconSource = TAB_ICONS[index]
          if (!iconSource) return null

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tabItem}
              onPress={() => navigation.navigate(route.name)}
              activeOpacity={0.7}
            >
              <Image
                source={iconSource}
                style={[styles.tabIcon, isFocused && styles.tabIconActive]}
                resizeMode="contain"
              />
            </TouchableOpacity>
          )
        })}
      </View>

      {/* safe area 分の余白（革素材で塗りつぶされる） */}
      <View style={{ height: bottomPad }} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    overflow: 'hidden',
  },
  bar: {
    height: TAB_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leatherBg: {
    position: 'absolute',
    top: 0,
    left: LEATHER_LEFT,
    width: LEATHER_RENDER_WIDTH,
    bottom: 0,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  tabIcon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    opacity: 0.7,
  },
  tabIconActive: {
    opacity: 1,
  },
  fabSpacer: {
    width: FAB_SIZE + 65,
  },
  fab: {
    position: 'absolute',
    top: -(FAB_SIZE / 2),
    alignSelf: 'center',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#3D2B1F',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  fabIcon: {
    width: FAB_SIZE * 1.2,
    height: FAB_SIZE * 1.2,
  },
})
