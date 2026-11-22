import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/theme';

type Profile = { display_name: string; timezone: string };
type Usage = { used: number; photo_limit: number };
type HomeData = { profile: Profile | null; usage: Usage | null; error: string };

async function fetchHome(): Promise<HomeData> {
  const [p, u] = await Promise.all([
    supabase.from('profiles').select('display_name, timezone').single(),
    supabase.rpc('my_photo_usage').single(),
  ]);
  const err = p.error ?? u.error;
  return {
    profile: (p.data as Profile | null) ?? null,
    usage: (u.data as Usage | null) ?? null,
    error: err ? `データを読み込めませんでした：${err.message}` : '',
  };
}

// 段階0の確認用の画面：ログインできていること、DB とつながっていることを表示する
export default function HomeScreen() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  const apply = useCallback((r: HomeData) => {
    setError(r.error);
    if (r.profile) setProfile(r.profile);
    if (r.usage) setUsage(r.usage);
  }, []);

  const load = useCallback(() => fetchHome().then(apply), [apply]);

  useEffect(() => {
    let active = true;
    fetchHome().then((r) => active && apply(r));
    return () => {
      active = false;
    };
  }, [apply]);

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
  }

  const name = profile?.display_name || session?.user.email;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>一期一会</Text>
        <View style={styles.card}>
          <Text style={styles.greeting}>{name ? `ようこそ、${name} さん` : '読み込み中…'}</Text>
          {usage && (
            <Text style={styles.muted}>
              保存している写真：{usage.used} / {usage.photo_limit} 枚
            </Text>
          )}
          {profile && <Text style={styles.muted}>タイムゾーン：{profile.timezone}</Text>}
          <ErrorText>{error}</ErrorText>
        </View>
        <Text style={styles.muted}>次の段階で、撮影と思い出の一覧をここに作ります。</Text>
        <View style={{ flex: 1 }} />
        <Button title="再読み込み" variant="secondary" onPress={load} />
        <Button title="ログアウト" variant="secondary" onPress={signOut} loading={signingOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: 3 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  greeting: { fontSize: 18, color: colors.text, fontWeight: '600' },
  muted: { fontSize: 14, color: colors.textMuted },
});
