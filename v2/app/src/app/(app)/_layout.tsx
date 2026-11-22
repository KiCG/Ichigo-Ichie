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
      <Stack.Screen name="album/[id]/index" options={{ title: '' }} />
      <Stack.Screen name="album/[id]/settings" options={{ title: '' }} />
      <Stack.Screen name="album/new" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="join" options={{ presentation: 'modal', title: '招待コードで参加' }} />
      <Stack.Screen name="move/[id]" options={{ presentation: 'modal', title: 'アルバムに入れる' }} />
    </Stack>
  );
}
