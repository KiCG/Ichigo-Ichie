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
import type { AuthStackParamList } from '../../types'

const COLORS = {
  background: '#FAFAF7',
  accent: '#8B7355',
  text: '#2C2C2C',
  subtext: '#9E9E9E',
  border: '#E0D9D0',
  error: '#C0392B',
}

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
            placeholderTextColor={COLORS.subtext}
            value={name}
            onChangeText={setName}
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="メールアドレス"
            placeholderTextColor={COLORS.subtext}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="パスワード（6文字以上）"
            placeholderTextColor={COLORS.subtext}
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
              ? <ActivityIndicator color="#fff" />
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
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 40,
    fontWeight: '300',
    color: COLORS.accent,
    letterSpacing: 8,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.subtext,
    letterSpacing: 2,
    marginBottom: 48,
  },
  form: {
    width: '100%',
    marginBottom: 24,
  },
  input: {
    width: '100%',
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 24,
    fontSize: 15,
    color: COLORS.text,
    paddingHorizontal: 4,
  },
  error: {
    color: COLORS.error,
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    color: COLORS.accent,
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    width: '100%',
    height: 48,
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    letterSpacing: 2,
  },
  link: {
    color: COLORS.subtext,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
})
