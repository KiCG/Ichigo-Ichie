import React, { useRef, useEffect, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { COLORS, FONTS, SPACING } from '../theme'

interface Props {
  visible: boolean
  title: string
  placeholder?: string
  initialValue: string
  onSave: (text: string) => void
  onCancel: () => void
  saving?: boolean
}

export default function TextEditorModal({
  visible, title, placeholder, initialValue, onSave, onCancel, saving = false,
}: Props) {
  const [text, setText] = useState(initialValue)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const inputRef = useRef<TextInput>(null)

  useEffect(() => {
    if (visible) {
      setText(initialValue)
      const t = setTimeout(() => inputRef.current?.focus(), 300)
      return () => clearTimeout(t)
    }
  }, [visible])

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false))
    return () => { show.remove(); hide.remove() }
  }, [])

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onCancel}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel} style={styles.headerSide}>
              <Text style={styles.cancelText}>キャンセル</Text>
            </TouchableOpacity>

            <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>

            <View style={[styles.headerSide, styles.headerSideRight]}>
              {keyboardVisible && (
                <TouchableOpacity onPress={() => Keyboard.dismiss()} style={styles.dismissBtn}>
                  <Ionicons name="chevron-down" size={18} color={COLORS.inkSub} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => onSave(text)}
                disabled={saving || !text.trim()}
              >
                <Text style={[styles.doneText, (!text.trim() || saving) && styles.doneDisabled]}>
                  完了
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={COLORS.inkSoft}
            multiline
            textAlignVertical="top"
            autoCorrect={false}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.paper },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  headerSide: { minWidth: 72 },
  headerSideRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.md,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FONTS.serif,
    fontSize: 16,
    color: COLORS.ink,
    textAlign: 'center',
  },
  cancelText: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.inkSub,
  },
  dismissBtn: {
    padding: SPACING.xs,
  },
  doneText: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.accent,
  },
  doneDisabled: { opacity: 0.35 },
  input: {
    flex: 1,
    fontFamily: FONTS.serif,
    fontSize: 17,
    color: COLORS.ink,
    lineHeight: 30,
    padding: SPACING.xl,
    textAlignVertical: 'top',
  },
})
