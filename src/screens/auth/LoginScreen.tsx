import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { supabase } from '../../lib/supabase'
import { COLORS, FONTS, SPACING, TYPE, RADIUS } from '../../theme'
import type { AuthStackParamList } from '../../types'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>
}

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください')
      return
    }
    setError('')
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError) setError(authError.message)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>一期一会</Text>
        <Text style={styles.subtitle}>その場所で、もう一度。</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="メールアドレス"
            placeholderTextColor={COLORS.inkSoft}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="パスワード"
            placeholderTextColor={COLORS.inkSoft}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error !== '' && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={COLORS.white} />
              : <Text style={styles.buttonText}>ログイン</Text>
            }
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
          <Text style={styles.link}>アカウントをお持ちでない方はこちら</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.paper },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxxl,
  },
  title: {
    fontFamily: FONTS.serif,
    fontSize: 36,
    color: COLORS.ink,
    letterSpacing: 8,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontFamily: FONTS.serif,
    fontSize: 13,
    color: COLORS.inkSub,
    letterSpacing: 2,
    marginBottom: SPACING.huge,
  },
  form: {
    width: '100%',
    marginBottom: SPACING.xxl,
  },
  input: {
    width: '100%',
    height: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
    marginBottom: SPACING.xxl,
    fontFamily: FONTS.sans,
    fontSize: 15,
    color: COLORS.ink,
    paddingHorizontal: SPACING.xs,
  },
  error: {
    color: COLORS.danger,
    fontFamily: FONTS.sans,
    fontSize: 13,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.thumb,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: COLORS.white,
    fontFamily: FONTS.sans,
    fontSize: 15,
    letterSpacing: 2,
  },
  link: {
    color: COLORS.inkSub,
    fontFamily: FONTS.sans,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
})
