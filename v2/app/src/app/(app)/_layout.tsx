import { Stack } from 'expo-router';

import { colors } from '@/theme';

// ログイン後の画面。段階1以降でタブや画面を足していく
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
