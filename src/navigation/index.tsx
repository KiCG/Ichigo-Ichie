import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'

import { useAuth } from '../hooks/useAuth'
import LoginScreen from '../screens/auth/LoginScreen'
import SignupScreen from '../screens/auth/SignupScreen'
import NearbyScreen from '../screens/home/NearbyScreen'
import CaptureScreen from '../screens/camera/CaptureScreen'
import UnlockCameraScreen from '../screens/camera/UnlockCameraScreen'
import TmpAlbumScreen from '../screens/tmp/TmpAlbumScreen'
import WriteMessageScreen from '../screens/tmp/WriteMessageScreen'
import BookshelfScreen from '../screens/album/BookshelfScreen'
import AlbumDetailScreen from '../screens/album/AlbumDetailScreen'
import SettingsScreen from '../screens/settings/SettingsScreen'

import type {
  AuthStackParamList,
  CameraStackParamList,
  HomeStackParamList,
  TmpStackParamList,
  AlbumStackParamList,
  MainTabParamList,
} from '../types'

const AuthStack = createNativeStackNavigator<AuthStackParamList>()
const CameraStack = createNativeStackNavigator<CameraStackParamList>()
const HomeStack = createNativeStackNavigator<HomeStackParamList>()
const TmpStack = createNativeStackNavigator<TmpStackParamList>()
const AlbumStack = createNativeStackNavigator<AlbumStackParamList>()
const Tab = createBottomTabNavigator<MainTabParamList>()

function CameraNavigator() {
  return (
    <CameraStack.Navigator>
      <CameraStack.Screen name="Capture" component={CaptureScreen} options={{ headerShown: false }} />
    </CameraStack.Navigator>
  )
}

function HomeNavigator() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen name="Nearby" component={NearbyScreen} options={{ title: '近くの思い出' }} />
      <HomeStack.Screen name="UnlockCamera" component={UnlockCameraScreen} options={{ title: 'ロック解除' }} />
    </HomeStack.Navigator>
  )
}

function TmpNavigator() {
  return (
    <TmpStack.Navigator>
      <TmpStack.Screen name="TmpAlbum" component={TmpAlbumScreen} options={{ title: 'tmpアルバム' }} />
      <TmpStack.Screen name="WriteMessage" component={WriteMessageScreen} options={{ title: 'メッセージを書く' }} />
    </TmpStack.Navigator>
  )
}

function AlbumNavigator() {
  return (
    <AlbumStack.Navigator>
      <AlbumStack.Screen name="Bookshelf" component={BookshelfScreen} options={{ title: '本棚' }} />
      <AlbumStack.Screen name="AlbumDetail" component={AlbumDetailScreen} options={{ title: 'アルバム' }} />
    </AlbumStack.Navigator>
  )
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const icons: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
            HomeTab: 'map',
            CameraTab: 'camera',
            TmpTab: 'time',
            AlbumTab: 'book',
            SettingsTab: 'settings',
          }
          return <Ionicons name={icons[route.name]} size={size} color={color} />
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeNavigator} options={{ title: 'ホーム', headerShown: false }} />
      <Tab.Screen name="CameraTab" component={CameraNavigator} options={{ title: 'カメラ', headerShown: false }} />
      <Tab.Screen name="TmpTab" component={TmpNavigator} options={{ title: 'tmp', headerShown: false }} />
      <Tab.Screen name="AlbumTab" component={AlbumNavigator} options={{ title: 'アルバム', headerShown: false }} />
      <Tab.Screen name="SettingsTab" component={SettingsScreen} options={{ title: '設定' }} />
    </Tab.Navigator>
  )
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
    </AuthStack.Navigator>
  )
}

export default function Navigation() {
  const { session, loading } = useAuth()

  if (loading) return null

  return (
    <NavigationContainer>
      {session ? <MainTabs /> : <AuthNavigator />}
    </NavigationContainer>
  )
}
