import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText, Field } from '@/components/ui';
import { authErrorMessage } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/theme';

type Mode = 'sign-in' | 'sign-up';

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isSignUp = mode === 'sign-up';

  async function submit() {
    setError('');
    setNotice('');
    if (!email.trim() || !password) {
      setError('メールアドレスとパスワードを入力してください。');
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        });
        if (error) throw error;
        // メール確認が有効な場合は、まだログインしていない
        if (!data.session) {
          setNotice('確認メールを送りました。メールのリンクを開いてから、ログインしてください。');
          setMode('sign-in');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
      // ログインに成功すると、画面は自動で切り替わる
    } catch (e) {
      setError(authErrorMessage(e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>一期一会</Text>
            <Text style={styles.subtitle}>その時、その場所で、何を思った？</Text>
          </View>

          <View style={styles.form}>
            {isSignUp && (
              <Field
                label="表示名（共有したときに相手に見える名前）"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="例：たろう"
                autoCapitalize="none"
              />
            )}
            <Field
              label="メールアドレス"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <Field
              label="パスワード（6文字以上）"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              textContentType={isSignUp ? 'newPassword' : 'password'}
            />
            <ErrorText>{error}</ErrorText>
            {!!notice && <Text style={styles.notice}>{notice}</Text>}
            <Button title={isSignUp ? '登録する' : 'ログイン'} onPress={submit} loading={loading} />
            <Button
              title={isSignUp ? 'アカウントをお持ちの方はこちら' : 'はじめての方はこちら（新規登録）'}
              variant="secondary"
              onPress={() => {
                setMode(isSignUp ? 'sign-in' : 'sign-up');
                setError('');
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.xl },
  header: { alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 36, fontWeight: '700', color: colors.text, letterSpacing: 4 },
  subtitle: { fontSize: 14, color: colors.textMuted },
  form: { gap: spacing.md },
  notice: { color: colors.text, fontSize: 14 },
});
