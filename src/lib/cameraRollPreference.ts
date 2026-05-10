import * as SecureStore from 'expo-secure-store'

export type CameraRollPreference = 'all' | 'message_only' | 'none'

const KEY = 'camera_roll_preference'
const DEFAULT: CameraRollPreference = 'all'

export async function getCameraRollPreference(): Promise<CameraRollPreference> {
  const value = await SecureStore.getItemAsync(KEY)
  return (value as CameraRollPreference) ?? DEFAULT
}

export async function setCameraRollPreference(value: CameraRollPreference): Promise<void> {
  await SecureStore.setItemAsync(KEY, value)
}
