import { Stack } from 'expo-router';

import { colors } from '@/theme';

// ログイン後の画面
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="capture" options={{ presentation: 'fullScreenModal', headerShown: false }} />
      <Stack.Screen name="unlock/[id]" options={{ presentation: 'fullScreenModal', headerShown: false }} />
      <Stack.Screen name="memory/[id]" options={{ title: '' }} />
    </Stack>
  );
}
