import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { supabase } from '../lib/supabase'
import { COLORS, FONTS, SPACING, RADIUS } from '../theme'

const SCANNER_SIZE = Dimensions.get('window').width - 96

type Props = {
  visible: boolean
  onClose: () => void
  onAccepted: () => void
}

export default function AcceptShareModal({ visible, onClose, onAccepted }: Props) {
  const [shareCodeInput, setShareCodeInput] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [showQrScanner, setShowQrScanner] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()

  const handleClose = () => {
    setShareCodeInput('')
    setShowQrScanner(false)
    setScanned(false)
    onClose()
  }

  const handleAcceptShare = async (tokenOverride?: string) => {
    const token = (tokenOverride ?? shareCodeInput).trim()
    if (!token) return
    setAccepting(true)
    try {
      const { data, error } = await supabase.rpc('accept_album_share', { p_token: token })
      if (error) throw error
      if (!data) {
        Alert.alert('無効なコード', 'このコードは無効か、すでに使用済みです。')
        return
      }
      handleClose()
      onAccepted()
      Alert.alert('追加しました', '共有アルバムが追加されました。')
    } catch {
      Alert.alert('エラー', '操作に失敗しました。もう一度お試しください。')
    } finally {
      setAccepting(false)
    }
  }

  const handleOpenQrScanner = async () => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission()
      if (!granted) {
        Alert.alert('カメラへのアクセスが必要です', '設定からカメラの使用を許可してください。')
        return
      }
    }
    setScanned(false)
    setShowQrScanner(true)
  }

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return
    setScanned(true)
    setShowQrScanner(false)
    handleAcceptShare(data)
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={showQrScanner ? undefined : handleClose}>
        <Pressable style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>共有アルバムを追加</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.cancelText}>キャンセル</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, !showQrScanner && styles.toggleBtnActive]}
              onPress={() => setShowQrScanner(false)}
            >
              <Text style={[styles.toggleBtnText, !showQrScanner && styles.toggleBtnTextActive]}>
                コードを入力
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, showQrScanner && styles.toggleBtnActive]}
              onPress={handleOpenQrScanner}
            >
              <Text style={[styles.toggleBtnText, showQrScanner && styles.toggleBtnTextActive]}>
                QRスキャン
              </Text>
            </TouchableOpacity>
          </View>

          {showQrScanner ? (
            <View style={styles.scannerWrapper}>
              <CameraView
                style={styles.scanner}
                facing="back"
                onBarcodeScanned={handleBarcodeScanned}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              />
              <View style={styles.scannerFrame} pointerEvents="none" />
              {accepting && (
                <View style={styles.scannerOverlay}>
                  <ActivityIndicator color={COLORS.white} size="large" />
                </View>
              )}
            </View>
          ) : (
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={shareCodeInput}
                onChangeText={setShareCodeInput}
                placeholder="共有コードを貼り付け"
                placeholderTextColor={COLORS.inkSoft}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.primaryBtn, (!shareCodeInput.trim() || accepting) && styles.btnDisabled]}
                onPress={() => handleAcceptShare()}
                disabled={!shareCodeInput.trim() || accepting}
              >
                {accepting
                  ? <ActivityIndicator color={COLORS.white} size="small" />
                  : <Text style={styles.primaryBtnText}>追加する</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(44,38,32,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxxl,
  },
  modal: {
    width: '100%',
    backgroundColor: COLORS.paper,
    borderRadius: SPACING.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  title: { fontFamily: FONTS.serif, fontSize: 16, color: COLORS.ink },
  cancelText: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.inkSub },

  toggleRow: {
    flexDirection: 'row',
    margin: SPACING.lg,
    borderRadius: RADIUS.thumb,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
    overflow: 'hidden',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    backgroundColor: COLORS.paper,
  },
  toggleBtnActive: { backgroundColor: COLORS.accent },
  toggleBtnText: { fontFamily: FONTS.sans, fontSize: 13, color: COLORS.inkSub },
  toggleBtnTextActive: { color: COLORS.white, fontWeight: '500' },

  scannerWrapper: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    borderRadius: SPACING.sm,
    overflow: 'hidden',
    height: SCANNER_SIZE,
    position: 'relative',
  },
  scanner: { width: '100%', height: '100%' },
  scannerFrame: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 180,
    height: 180,
    marginTop: -90,
    marginLeft: -90,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: SPACING.sm,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  inputWrapper: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    gap: SPACING.md,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
    borderRadius: RADIUS.thumb,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.ink,
    backgroundColor: COLORS.white,
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.thumb,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.white,
    letterSpacing: 1,
  },
  btnDisabled: { opacity: 0.45 },
})
