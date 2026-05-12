import React, { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'

import { useAuth } from '../hooks/useAuth'
import LoginScreen from '../screens/auth/LoginScreen'
import SignupScreen from '../screens/auth/SignupScreen'
import NearbyScreen from '../screens/home/NearbyScreen'
import CaptureScreen from '../screens/camera/CaptureScreen'
import UnlockCameraScreen from '../screens/camera/UnlockCameraScreen'
import CollectionScreen from '../screens/collection/CollectionScreen'
import WriteMessageScreen from '../screens/tmp/WriteMessageScreen'
import AlbumDetailScreen from '../screens/album/AlbumDetailScreen'
import BookshelfDetailScreen from '../screens/album/BookshelfDetailScreen'
import SettingsScreen from '../screens/settings/SettingsScreen'
import CustomTabBar from '../components/CustomTabBar'
import { CameraProvider } from '../contexts/CameraContext'

import { registerForPushNotifications } from '../lib/notifications'
import type {
  AuthStackParamList,
  HomeStackParamList,
  CameraStackParamList,
  CollectionStackParamList,
  MainTabParamList,
} from '../types'

const AuthStack = createNativeStackNavigator<AuthStackParamList>()
const HomeStack = createNativeStackNavigator<HomeStackParamList>()
const CameraStack = createNativeStackNavigator<CameraStackParamList>()
const CollectionStack = createNativeStackNavigator<CollectionStackParamList>()
const Tab = createBottomTabNavigator<MainTabParamList>()

function HomeNavigator() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen name="Nearby" component={NearbyScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="UnlockCamera" component={UnlockCameraScreen} options={{ title: 'ロック解除' }} />
    </HomeStack.Navigator>
  )
}

function CameraNavigator() {
  return (
    <CameraStack.Navigator>
      <CameraStack.Screen name="Capture" component={CaptureScreen} options={{ headerShown: false }} />
    </CameraStack.Navigator>
  )
}

function CollectionNavigator() {
  return (
    <CollectionStack.Navigator>
      <CollectionStack.Screen
        name="CollectionHome"
        component={CollectionScreen}
        options={{ headerShown: false }}
      />
      <CollectionStack.Screen
        name="WriteMessage"
        component={WriteMessageScreen}
        options={{ title: 'メッセージを書く' }}
      />
      <CollectionStack.Screen
        name="AlbumDetail"
        component={AlbumDetailScreen}
        options={{ title: 'アルバム' }}
      />
      <CollectionStack.Screen
        name="BookshelfDetail"
        component={BookshelfDetailScreen}
        options={({ route }) => ({ title: route.params.bookshelfTitle })}
      />
    </CollectionStack.Navigator>
  )
}

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="HomeTab" component={HomeNavigator} />
      <Tab.Screen name="CollectionTab" component={CollectionNavigator} />
      <Tab.Screen name="CameraTab" component={CameraNavigator} />
      <Tab.Screen name="SettingsTab" component={SettingsScreen} />
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

  useEffect(() => {
    if (session) {
      registerForPushNotifications()
    }
  }, [session])

  if (loading) return null

  return (
    <CameraProvider>
      <NavigationContainer>
        {session ? <MainTabs /> : <AuthNavigator />}
      </NavigationContainer>
    </CameraProvider>
  )
}
