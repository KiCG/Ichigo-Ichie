import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { supabase } from '../../lib/supabase'
import {
  getCameraRollPreference,
  setCameraRollPreference,
  type CameraRollPreference,
} from '../../lib/cameraRollPreference'

const COLORS = {
  background: '#FAFAF7',
  accent: '#8B7355',
  text: '#2C2C2C',
  subtext: '#9E9E9E',
  border: '#E0D9D0',
  error: '#C0392B',
  selected: '#F5EFE6',
}

const PREFERENCE_OPTIONS: { value: CameraRollPreference; label: string; description: string }[] = [
  {
    value: 'all',
    label: 'すべての写真を保存',
    description: 'アプリで撮影したすべての写真をカメラロールに保存します',
  },
  {
    value: 'message_only',
    label: 'メッセージ付きのみ保存',
    description: 'メッセージを書いて保存した写真だけをカメラロールに保存します',
  },
  {
    value: 'none',
    label: '保存しない',
    description: 'カメラロールには何も保存しません',
  },
]

export default function SettingsScreen() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [preference, setPreference] = useState<CameraRollPreference>('all')
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)

  const loadSettings = useCallback(async () => {
    const [{ data: { user } }, pref] = await Promise.all([
      supabase.auth.getUser(),
      getCameraRollPreference(),
    ])
    if (user) {
      setEmail(user.email ?? '')
      setName(user.user_metadata?.name ?? '')
    }
    setPreference(pref)
  }, [])

  useEffect(() => {
    loadSettings().finally(() => setLoading(false))
  }, [loadSettings])

  const handlePreferenceChange = async (value: CameraRollPreference) => {
    setPreference(value)
    await setCameraRollPreference(value)
  }

  const handleSignOut = () => {
    Alert.alert('ログアウト', 'ログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'ログアウト',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true)
          await supabase.auth.signOut()
          setSigningOut(false)
        },
      },
    ])
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>アカウント</Text>
        <View style={styles.infoCard}>
          {name !== '' && (
            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>名前</Text>
              <Text style={styles.infoValue}>{name}</Text>
            </View>
          )}
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoKey}>メール</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{email}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>カメラロールへの保存</Text>
        {PREFERENCE_OPTIONS.map(option => (
          <TouchableOpacity
            key={option.value}
            style={[styles.optionRow, preference === option.value && styles.optionRowSelected]}
            onPress={() => handlePreferenceChange(option.value)}
            activeOpacity={0.7}
          >
            <View style={styles.optionRadio}>
              {preference === option.value && <View style={styles.optionRadioInner} />}
            </View>
            <View style={styles.optionBody}>
              <Text style={[styles.optionLabel, preference === option.value && styles.optionLabelSelected]}>
                {option.label}
              </Text>
              <Text style={styles.optionDescription}>{option.description}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.signOutButton, signingOut && styles.signOutButtonDisabled]}
          onPress={handleSignOut}
          disabled={signingOut}
        >
          {signingOut
            ? <ActivityIndicator color={COLORS.error} />
            : <Text style={styles.signOutText}>ログアウト</Text>
          }
        </TouchableOpacity>
      </View>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: 20, paddingTop: 32 },
  sectionLabel: {
    fontSize: 11,
    color: COLORS.subtext,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoKey: { fontSize: 14, color: COLORS.subtext },
  infoValue: { fontSize: 14, color: COLORS.text, flexShrink: 1, marginLeft: 16, textAlign: 'right' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 8,
    gap: 12,
  },
  optionRowSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.selected,
  },
  optionRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  optionRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  optionBody: { flex: 1, gap: 4 },
  optionLabel: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  optionLabelSelected: { color: COLORS.accent },
  optionDescription: { fontSize: 12, color: COLORS.subtext, lineHeight: 18 },
  signOutButton: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutButtonDisabled: { opacity: 0.5 },
  signOutText: { color: COLORS.error, fontSize: 14 },
})
