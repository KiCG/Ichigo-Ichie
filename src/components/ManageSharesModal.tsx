import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { COLORS, FONTS, SPACING, RADIUS } from '../theme'

type ShareEntry = {
  id: string
  shared_to_user_id: string | null
  can_message: boolean
  can_add_photos: boolean
  shared_at: string
}

type Props = {
  album: { id: string; title: string } | null
  onClose: () => void
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function ManageSharesModal({ album, onClose }: Props) {
  const [shares, setShares] = useState<ShareEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  const fetchShares = useCallback(async () => {
    if (!album) return
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase
        .from('album_shares')
        .select('id, shared_to_user_id, can_message, can_add_photos, shared_at')
        .eq('album_id', album.id)
        .eq('shared_by_user_id', user.id)
        .order('shared_at', { ascending: false })
      if (!error) setShares(data ?? [])
    } finally {
      setLoading(false)
    }
  }, [album])

  useEffect(() => {
    if (album) {
      fetchShares()
    } else {
      setShares([])
    }
  }, [album, fetchShares])

  const handleRevoke = (share: ShareEntry) => {
    const label = share.shared_to_user_id ? '承認済みの共有' : '未承認のコード'
    Alert.alert(
      '共有を取り消しますか？',
      `${label}を削除します。相手はアルバムにアクセスできなくなります。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '取り消す',
          style: 'destructive',
          onPress: async () => {
            setRevoking(share.id)
            try {
              const { error } = await supabase.from('album_shares').delete().eq('id', share.id)
              if (error) throw error
              setShares(prev => prev.filter(s => s.id !== share.id))
            } catch {
              Alert.alert('エラー', '操作に失敗しました。もう一度お試しください。')
            } finally {
              setRevoking(null)
            }
          },
        },
      ]
    )
  }

  return (
    <Modal
      visible={album !== null}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>共有を管理</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>閉じる</Text>
            </TouchableOpacity>
          </View>

          {album && (
            <Text style={styles.albumName} numberOfLines={1}>{album.title}</Text>
          )}

          {loading ? (
            <View style={styles.centerArea}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          ) : shares.length === 0 ? (
            <View style={styles.centerArea}>
              <Ionicons name="people-outline" size={32} color={COLORS.inkSoft} />
              <Text style={styles.emptyText}>まだ誰とも共有していません</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {shares.map((share, idx) => (
                <View
                  key={share.id}
                  style={[styles.row, idx < shares.length - 1 && styles.rowBorder]}
                >
                  <View style={styles.rowInfo}>
                    <View style={styles.statusRow}>
                      <Ionicons
                        name={share.shared_to_user_id ? 'person-circle-outline' : 'time-outline'}
                        size={15}
                        color={share.shared_to_user_id ? COLORS.accent : COLORS.inkSub}
                        style={styles.statusIcon}
                      />
                      <Text style={share.shared_to_user_id ? styles.statusAccepted : styles.statusPending}>
                        {share.shared_to_user_id ? '承認済み' : '未承認'}
                      </Text>
                    </View>

                    <View style={styles.badgeRow}>
                      {share.can_message && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>メッセージ相互</Text>
                        </View>
                      )}
                      {share.can_add_photos && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>写真追加</Text>
                        </View>
                      )}
                      {!share.can_message && !share.can_add_photos && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>閲覧のみ</Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.dateText}>{formatDate(share.shared_at)}</Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.revokeBtn, revoking === share.id && styles.revokeBtnDisabled]}
                    onPress={() => handleRevoke(share)}
                    disabled={revoking !== null}
                  >
                    {revoking === share.id
                      ? <ActivityIndicator size="small" color={COLORS.seal} />
                      : <Text style={styles.revokeBtnText}>取り消す</Text>
                    }
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
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
    maxHeight: '80%',
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
  closeText: { fontFamily: FONTS.sans, fontSize: 14, color: COLORS.inkSub },
  albumName: {
    fontFamily: FONTS.serif,
    fontSize: 13,
    color: COLORS.inkSub,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  centerArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.huge,
    gap: SPACING.md,
  },
  emptyText: {
    fontFamily: FONTS.sans,
    fontSize: 14,
    color: COLORS.inkSoft,
  },
  list: { flexGrow: 0 },
  listContent: { paddingVertical: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  rowInfo: { flex: 1, gap: SPACING.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  statusIcon: { marginTop: 1 },
  statusAccepted: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.accent,
  },
  statusPending: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: COLORS.inkSub,
  },
  badgeRow: { flexDirection: 'row', gap: SPACING.xs, flexWrap: 'wrap' },
  badge: {
    backgroundColor: COLORS.paperDeep,
    borderRadius: RADIUS.thumb,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
  },
  badgeText: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: COLORS.inkSub,
  },
  dateText: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: COLORS.inkSoft,
  },
  revokeBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.thumb,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.seal,
    minWidth: 64,
    alignItems: 'center',
  },
  revokeBtnDisabled: { opacity: 0.4 },
  revokeBtnText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: COLORS.seal,
  },
})
