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
import { COLORS, FONTS, SPACING, RADIUS } from '../../theme'
import type { AuthStackParamList } from '../../types'

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Signup'>
}

export default function SignupScreen({ navigation }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleSignup = async () => {
    if (!name || !email || !password) {
      setError('すべての項目を入力してください')
      return
    }
    if (password.length < 6) {
      setError('パスワードは6文字以上で設定してください')
      return
    }
    setError('')
    setMessage('')
    setLoading(true)
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    setLoading(false)
    if (authError) {
      setError(authError.message)
    } else {
      setMessage('確認メールを送信しました。メールのリンクからアカウントを有効化してください。')
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>一期一会</Text>
        <Text style={styles.subtitle}>新しい思い出をはじめましょう</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="名前"
            placeholderTextColor={COLORS.inkSoft}
            value={name}
            onChangeText={setName}
            autoCorrect={false}
          />
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
            placeholder="パスワード（6文字以上）"
            placeholderTextColor={COLORS.inkSoft}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error !== '' && <Text style={styles.error}>{error}</Text>}
          {message !== '' && <Text style={styles.message}>{message}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={COLORS.white} />
              : <Text style={styles.buttonText}>アカウントを作成</Text>
            }
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.link}>すでにアカウントをお持ちの方はこちら</Text>
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
  form: { width: '100%', marginBottom: SPACING.xxl },
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
  message: {
    color: COLORS.accent,
    fontFamily: FONTS.sans,
    fontSize: 13,
    marginBottom: SPACING.md,
    textAlign: 'center',
    lineHeight: 20,
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
