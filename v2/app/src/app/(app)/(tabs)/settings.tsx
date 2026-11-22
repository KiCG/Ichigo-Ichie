import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getPhotoUsage } from '@/lib/memories';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/theme';

type Info = { name: string; used: number; limit: number } | null;

async function loadInfo(): Promise<Info> {
  const [p, usage] = await Promise.all([
    supabase.from('profiles').select('display_name').single(),
    getPhotoUsage().catch(() => null),
  ]);
  return { name: p.data?.display_name ?? '', used: usage?.used ?? 0, limit: usage?.photo_limit ?? 0 };
}

export default function SettingsScreen() {
  const { session } = useAuth();
  const [info, setInfo] = useState<Info>(null);
  const [signingOut, setSigningOut] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadInfo().then((i) => active && setInfo(i));
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>その他</Text>
        <View style={styles.card}>
          <Row label="表示名" value={info?.name || '（未設定）'} />
          <Row label="メールアドレス" value={session?.user.email ?? ''} />
          <Row label="保存している写真" value={info ? `${info.used} / ${info.limit} 枚` : ''} />
        </View>
        <View style={{ flex: 1 }} />
        <Button
          title="ログアウト"
          variant="secondary"
          loading={signingOut}
          onPress={async () => {
            setSigningOut(true);
            await supabase.auth.signOut();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.md, gap: spacing.md },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: 2, paddingVertical: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  row: { paddingVertical: spacing.md, gap: 2 },
  label: { fontSize: 13, color: colors.textMuted },
  value: { fontSize: 16, color: colors.text },
});
