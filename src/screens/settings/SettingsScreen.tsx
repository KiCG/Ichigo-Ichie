import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import AcceptShareModal from '../../components/AcceptShareModal'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import {
  getCameraRollPreference,
  setCameraRollPreference,
  type CameraRollPreference,
} from '../../lib/cameraRollPreference'
import {
  getAfterCapturePreference,
  setAfterCapturePreference,
} from '../../lib/afterCapturePreference'
import { COLORS, FONTS, SPACING, TYPE, RADIUS } from '../../theme'

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
  const [afterCapture, setAfterCapture] = useState(true)
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const [nameModalVisible, setNameModalVisible] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const nameInputRef = useRef<TextInput>(null)
  const [shareModalVisible, setShareModalVisible] = useState(false)

  const loadSettings = useCallback(async () => {
    const [{ data: { user } }, pref, ac] = await Promise.all([
      supabase.auth.getUser(),
      getCameraRollPreference(),
      getAfterCapturePreference(),
    ])
    if (user) {
      setEmail(user.email ?? '')
      setName(user.user_metadata?.name ?? '')
    }
    setPreference(pref)
    setAfterCapture(ac)
  }, [])

  useEffect(() => {
    loadSettings().finally(() => setLoading(false))
  }, [loadSettings])

  const handlePreferenceChange = async (value: CameraRollPreference) => {
    setPreference(value)
    await setCameraRollPreference(value)
  }

  const handleAfterCaptureChange = async (value: boolean) => {
    setAfterCapture(value)
    await setAfterCapturePreference(value)
  }

  const openNameModal = () => {
    setNameInput(name)
    setNameModalVisible(true)
    setTimeout(() => nameInputRef.current?.focus(), 100)
  }

  const handleSaveName = async () => {
    const trimmed = nameInput.trim()
    if (!trimmed) return
    setSavingName(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await Promise.all([
        supabase.from('users').update({ name: trimmed }).eq('id', user.id),
        supabase.auth.updateUser({ data: { name: trimmed } }),
      ])
      setName(trimmed)
      setNameModalVisible(false)
    } catch {
      Alert.alert('エラー', '名前の保存に失敗しました')
    } finally {
      setSavingName(false)
    }
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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>

      <View style={styles.titleWrap}>
        <Text style={styles.title}>設定</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>アカウント</Text>
        <View style={styles.infoCard}>
          <TouchableOpacity style={styles.infoRow} onPress={openNameModal} activeOpacity={0.7}>
            <Text style={styles.infoKey}>名前</Text>
            <View style={styles.infoValueRow}>
              <Text style={styles.infoValue} numberOfLines={1}>
                {name !== '' ? name : '未設定'}
              </Text>
              <Ionicons name="pencil-outline" size={14} color={COLORS.inkSoft} style={styles.editIcon} />
            </View>
          </TouchableOpacity>
          <View style={[styles.infoRow, styles.infoRowLast]}>
            <Text style={styles.infoKey}>メール</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{email}</Text>
          </View>
        </View>
      </View>

      <Modal
        visible={nameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNameModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setNameModalVisible(false)} />
          <View style={styles.nameModal}>
            <Text style={styles.nameModalTitle}>名前を変更</Text>
            <TextInput
              ref={nameInputRef}
              style={styles.nameInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="名前を入力"
              placeholderTextColor={COLORS.inkSoft}
              maxLength={30}
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
            <View style={styles.nameModalButtons}>
              <TouchableOpacity
                style={styles.nameModalCancel}
                onPress={() => setNameModalVisible(false)}
              >
                <Text style={styles.nameModalCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nameModalSave, (savingName || nameInput.trim() === '') && styles.nameModalSaveDisabled]}
                onPress={handleSaveName}
                disabled={savingName || nameInput.trim() === ''}
              >
                {savingName
                  ? <ActivityIndicator color={COLORS.white} size="small" />
                  : <Text style={styles.nameModalSaveText}>保存</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>アルバム</Text>
        <View style={styles.infoCard}>
          <TouchableOpacity
            style={[styles.infoRow, styles.infoRowLast]}
            onPress={() => setShareModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.infoKey, styles.actionKey]}>共有アルバムを追加</Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.accent} />
          </TouchableOpacity>
        </View>
      </View>

      <AcceptShareModal
        visible={shareModalVisible}
        onClose={() => setShareModalVisible(false)}
        onAccepted={() => {}}
      />

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>カメラ</Text>
        <View style={styles.infoCard}>
          <View style={[styles.infoRow, styles.infoRowLast]}>
            <View style={styles.toggleBody}>
              <Text style={styles.toggleLabel}>撮影後にメッセージ画面を開く</Text>
              <Text style={styles.toggleDescription}>写真を撮ったあと、自動でメッセージ入力画面に移動します</Text>
            </View>
            <Switch
              value={afterCapture}
              onValueChange={handleAfterCaptureChange}
              trackColor={{ false: COLORS.rule, true: COLORS.accent }}
              thumbColor={COLORS.white}
            />
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
            ? <ActivityIndicator color={COLORS.danger} />
            : <Text style={styles.signOutText}>ログアウト</Text>
          }
        </TouchableOpacity>
      </View>

    </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.paper },
  container: { flex: 1, backgroundColor: COLORS.paper },
  scroll: { paddingBottom: SPACING.huge },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.paper },

  titleWrap: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  title: {
    ...TYPE.title,
  },

  section: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xxl },
  sectionLabel: {
    ...TYPE.meta,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },
  infoCard: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoKey: { fontFamily: FONTS.sans, fontSize: 13, color: COLORS.inkSub },
  actionKey: { color: COLORS.accent },
  infoValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flexShrink: 1,
    marginLeft: SPACING.lg,
  },
  editIcon: { flexShrink: 0 },
  infoValue: {
    fontFamily: FONTS.serif,
    fontSize: 15,
    color: COLORS.ink,
    flexShrink: 1,
    textAlign: 'right',
  },

  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(44,38,32,0.45)',
    paddingHorizontal: SPACING.xl,
  },
  nameModal: {
    width: '100%',
    backgroundColor: COLORS.paper,
    borderRadius: RADIUS.thumb,
    padding: SPACING.xl,
    gap: SPACING.lg,
  },
  nameModalTitle: {
    fontFamily: FONTS.serif,
    fontSize: 17,
    color: COLORS.ink,
  },
  nameInput: {
    fontFamily: FONTS.serif,
    fontSize: 16,
    color: COLORS.ink,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.accent,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 0,
  },
  nameModalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  nameModalCancel: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.thumb,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameModalCancelText: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.inkSub,
  },
  nameModalSave: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameModalSaveDisabled: { opacity: 0.4 },
  nameModalSaveText: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.white,
    letterSpacing: 0.5,
  },

  toggleBody: { flex: 1, gap: SPACING.xs, paddingRight: SPACING.md },
  toggleLabel: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.ink,
  },
  toggleDescription: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: COLORS.inkSub,
    lineHeight: 18,
  },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
    borderRadius: RADIUS.thumb,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  optionRowSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.paperDeep,
  },
  optionRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
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
  optionBody: { flex: 1, gap: SPACING.xs },
  optionLabel: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.ink,
    fontWeight: '500',
  },
  optionLabelSelected: { color: COLORS.accent },
  optionDescription: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: COLORS.inkSub,
    lineHeight: 18,
  },
  signOutButton: {
    height: 50,
    borderRadius: RADIUS.thumb,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutButtonDisabled: { opacity: 0.5 },
  signOutText: {
    color: COLORS.danger,
    fontFamily: FONTS.sans,
    fontSize: 14,
    letterSpacing: 0.5,
  },
})
