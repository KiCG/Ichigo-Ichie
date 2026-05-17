import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  Share,
  Dimensions,
  Switch,
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { supabase } from '../lib/supabase'
import { COLORS, FONTS, SPACING, RADIUS } from '../theme'

const SCREEN_WIDTH = Dimensions.get('window').width
const QR_SIZE = Math.min(SCREEN_WIDTH - 120, 220)

type Props = {
  album: { id: string; title: string } | null
  onClose: () => void
}

export default function ShareAlbumModal({ album, onClose }: Props) {
  const [canMessage, setCanMessage] = useState(false)
  const [canAddPhotos, setCanAddPhotos] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    if (album) {
      setCanMessage(false)
      setCanAddPhotos(false)
      setToken(null)
    }
  }, [album])

  const handleGenerateShare = async () => {
    if (!album) return
    setGenerating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase
        .from('album_shares')
        .insert({
          album_id: album.id,
          shared_by_user_id: user.id,
          permission: 'read_only',
          can_message: canMessage,
          can_add_photos: canAddPhotos,
        })
        .select('share_token')
        .single()
      if (error || !data) throw error ?? new Error('failed')
      setToken(String(data.share_token))
    } catch {
      Alert.alert('エラー', '共有コードの生成に失敗しました。')
    } finally {
      setGenerating(false)
    }
  }

  const handleClose = () => {
    setToken(null)
    onClose()
  }

  return (
    <Modal
      visible={album !== null}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.modal}>
          {token ? (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>アルバムを共有</Text>
                <TouchableOpacity onPress={handleClose}>
                  <Text style={styles.cancelText}>閉じる</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.qrContent}>
                <Text style={styles.qrAlbumTitle} numberOfLines={1}>{album?.title}</Text>
                <View style={styles.qrWrapper}>
                  <QRCode value={token} size={QR_SIZE} backgroundColor={COLORS.white} />
                </View>
                <Text style={styles.qrHint}>
                  相手にこのQRコードをスキャンしてもらうか{'\n'}共有シートでコードを送ってください
                </Text>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => Share.share({
                    message: `一期一会のアルバム「${album?.title}」を共有します。\n共有コード: ${token}`,
                  })}
                >
                  <Text style={styles.primaryBtnText}>共有シートで送る</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>共有設定</Text>
                <TouchableOpacity onPress={handleClose}>
                  <Text style={styles.cancelText}>キャンセル</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.settingsBody}>
                {album && (
                  <Text style={styles.albumName} numberOfLines={1}>{album.title}</Text>
                )}
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <Text style={styles.settingLabel}>メッセージを相互表示する</Text>
                    <Text style={styles.settingDesc}>お互いの訪問メッセージが見られるようになります</Text>
                  </View>
                  <Switch
                    value={canMessage}
                    onValueChange={setCanMessage}
                    trackColor={{ true: COLORS.accent }}
                    thumbColor="#fff"
                  />
                </View>
                <View style={[styles.settingRow, styles.settingRowLast]}>
                  <View style={styles.settingInfo}>
                    <Text style={styles.settingLabel}>写真の追加を許可する</Text>
                    <Text style={styles.settingDesc}>受け取った側もアルバムに写真を追加できます</Text>
                  </View>
                  <Switch
                    value={canAddPhotos}
                    onValueChange={setCanAddPhotos}
                    trackColor={{ true: COLORS.accent }}
                    thumbColor="#fff"
                  />
                </View>
                <TouchableOpacity
                  style={[styles.primaryBtn, generating && styles.btnDisabled]}
                  onPress={handleGenerateShare}
                  disabled={generating}
                >
                  {generating
                    ? <ActivityIndicator color={COLORS.white} size="small" />
                    : <Text style={styles.primaryBtnText}>共有コードを生成</Text>
                  }
                </TouchableOpacity>
              </View>
            </>
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

  settingsBody: { padding: SPACING.xl, gap: SPACING.lg },
  albumName: {
    fontFamily: FONTS.serif,
    fontSize: 14,
    color: COLORS.inkSub,
    textAlign: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
    gap: SPACING.md,
  },
  settingRowLast: { borderBottomWidth: 0 },
  settingInfo: { flex: 1, gap: 2 },
  settingLabel: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.ink, fontWeight: '500' },
  settingDesc: { fontFamily: FONTS.sans, fontSize: 12, color: COLORS.inkSub, lineHeight: 17 },

  qrContent: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
    paddingBottom: SPACING.xxl,
    gap: SPACING.lg,
  },
  qrAlbumTitle: {
    fontFamily: FONTS.serif,
    fontSize: 16,
    color: COLORS.ink,
    marginTop: SPACING.sm,
  },
  qrWrapper: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: SPACING.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
  },
  qrHint: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: COLORS.inkSub,
    textAlign: 'center',
    lineHeight: 18,
  },

  primaryBtn: {
    width: '100%',
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.thumb,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  primaryBtnText: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.white, letterSpacing: 1 },
  btnDisabled: { opacity: 0.45 },
})
