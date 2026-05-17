import React, { useEffect, useRef } from 'react'
import { StyleSheet } from 'react-native'
import { NavigationContainer, DefaultTheme, NavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import * as Notifications from 'expo-notifications'

import { useAuth } from '../hooks/useAuth'
import LoginScreen from '../screens/auth/LoginScreen'
import SignupScreen from '../screens/auth/SignupScreen'
import NearbyScreen from '../screens/home/NearbyScreen'
import CaptureScreen from '../screens/camera/CaptureScreen'
import UnlockCameraScreen from '../screens/camera/UnlockCameraScreen'
import MemoriesScreen from '../screens/memories/MemoriesScreen'
import TmpAlbumScreen from '../screens/tmp/TmpAlbumScreen'
import WriteMessageScreen from '../screens/tmp/WriteMessageScreen'
import DeskScreen from '../screens/desk/DeskScreen'
import AlbumListScreen from '../screens/album/AlbumListScreen'
import BookshelfScreen from '../screens/album/BookshelfScreen'
import BookshelfDetailScreen from '../screens/album/BookshelfDetailScreen'
import AlbumDetailScreen from '../screens/album/AlbumDetailScreen'
import SettingsScreen from '../screens/settings/SettingsScreen'

import { registerForPushNotifications } from '../lib/notifications'
import { COLORS, FONTS } from '../theme'
import type {
  AuthStackParamList,
  CameraStackParamList,
  HomeStackParamList,
  MemoriesStackParamList,
  MainTabParamList,
} from '../types'

type RootNavRef = NavigationContainerRef<Record<string, object | undefined>>

const AuthStack = createNativeStackNavigator<AuthStackParamList>()
const CameraStack = createNativeStackNavigator<CameraStackParamList>()
const HomeStack = createNativeStackNavigator<HomeStackParamList>()
const MemoriesStack = createNativeStackNavigator<MemoriesStackParamList>()
const Tab = createBottomTabNavigator<MainTabParamList>()

const PaperTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: COLORS.paper,
    card: COLORS.paper,
    text: COLORS.ink,
    border: COLORS.rule,
    primary: COLORS.accent,
  },
}

const stackScreenOptions = {
  headerStyle: { backgroundColor: COLORS.paper },
  headerTintColor: COLORS.ink,
  headerTitleStyle: { fontFamily: FONTS.serif, fontSize: 17, fontWeight: '400' as const },
  headerShadowVisible: false,
  headerBackTitle: '',
  contentStyle: { backgroundColor: COLORS.paper },
}

function CameraNavigator() {
  return (
    <CameraStack.Navigator screenOptions={stackScreenOptions}>
      <CameraStack.Screen name="Capture" component={CaptureScreen} options={{ headerShown: false }} />
      <CameraStack.Screen name="WriteMessage" component={WriteMessageScreen} options={{ title: 'メッセージを残す' }} />
    </CameraStack.Navigator>
  )
}

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen name="Nearby" component={NearbyScreen} options={{ title: 'マップ' }} />
      <HomeStack.Screen name="UnlockCamera" component={UnlockCameraScreen} options={{ title: 'ロック解除' }} />
    </HomeStack.Navigator>
  )
}

function MemoriesNavigator() {
  return (
    <MemoriesStack.Navigator screenOptions={stackScreenOptions}>
      <MemoriesStack.Screen name="Memories" component={MemoriesScreen} options={{ title: '思い出' }} />
      <MemoriesStack.Screen name="TmpAll" component={TmpAlbumScreen} options={{ title: '現像待ち' }} />
      <MemoriesStack.Screen name="Desk" component={DeskScreen} options={{ title: '机の上' }} />
      <MemoriesStack.Screen name="AlbumList" component={AlbumListScreen} options={{ title: 'アルバム' }} />
      <MemoriesStack.Screen
        name="AlbumDetail"
        component={AlbumDetailScreen}
        options={({ route }) => ({ title: route.params.albumTitle })}
      />
      <MemoriesStack.Screen name="Bookshelf" component={BookshelfScreen} options={{ title: '本棚' }} />
      <MemoriesStack.Screen
        name="BookshelfDetail"
        component={BookshelfDetailScreen}
        options={({ route }) => ({ title: route.params.bookshelfTitle })}
      />
      <MemoriesStack.Screen name="WriteMessage" component={WriteMessageScreen} options={{ title: 'メッセージを残す' }} />
    </MemoriesStack.Navigator>
  )
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.paper,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: COLORS.rule,
          height: 84,
          paddingTop: 8,
          paddingBottom: 28,
        },
        tabBarActiveTintColor: COLORS.ink,
        tabBarInactiveTintColor: COLORS.inkSoft,
        tabBarLabelStyle: { fontFamily: FONTS.sans, fontSize: 10, letterSpacing: 0.5 },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
            HomeTab: 'compass-outline',
            MemoriesTab: 'book-outline',
            CameraTab: 'camera-outline',
            SettingsTab: 'ellipsis-horizontal',
          }
          return <Ionicons name={icons[route.name]} size={size} color={color} />
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeNavigator} options={{ title: 'マップ' }} />
      <Tab.Screen name="MemoriesTab" component={MemoriesNavigator} options={{ title: '思い出' }} />
      <Tab.Screen name="CameraTab" component={CameraNavigator} options={{ title: '撮る' }} />
      <Tab.Screen name="SettingsTab" component={SettingsScreen} options={{ title: 'その他' }} />
    </Tab.Navigator>
  )
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.paper } }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
    </AuthStack.Navigator>
  )
}

export default function Navigation() {
  const { session, loading } = useAuth()
  const navRef = useRef<RootNavRef>(null)

  useEffect(() => {
    if (session) {
      registerForPushNotifications()
    }
  }, [session])

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      // 通知タップ → 思い出タブへ遷移
      navRef.current?.navigate('MemoriesTab' as never)
    })
    return () => sub.remove()
  }, [])

  if (loading) return null

  return (
    <NavigationContainer theme={PaperTheme} ref={navRef}>
      {session ? <MainTabs /> : <AuthNavigator />}
    </NavigationContainer>
  )
}
