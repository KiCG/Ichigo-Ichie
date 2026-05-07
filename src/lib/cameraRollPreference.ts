import AsyncStorage from '@react-native-async-storage/async-storage'

export type CameraRollPreference = 'all' | 'message_only' | 'none'

const KEY = 'camera_roll_preference'
const DEFAULT: CameraRollPreference = 'all'

export async function getCameraRollPreference(): Promise<CameraRollPreference> {
  const value = await AsyncStorage.getItem(KEY)
  return (value as CameraRollPreference) ?? DEFAULT
}

export async function setCameraRollPreference(value: CameraRollPreference): Promise<void> {
  await AsyncStorage.setItem(KEY, value)
}
