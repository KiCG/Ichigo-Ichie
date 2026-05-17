import * as SecureStore from 'expo-secure-store'

const KEY = 'after_capture_navigate_to_message'

export async function getAfterCapturePreference(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(KEY)
  return value === null ? true : value === 'true'
}

export async function setAfterCapturePreference(value: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY, String(value))
}
