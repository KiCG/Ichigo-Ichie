import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText } from '@/components/ui';
import {
  type Album,
  createInvite,
  deleteAlbum,
  getAlbum,
  type Invite,
  inviteMessage,
  listInvites,
  listMembers,
  type Member,
  removeMember,
  revokeInvite,
  roleLabel,
} from '@/lib/albums';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/memories';
import { colors, spacing } from '@/theme';

type Loaded = { album: Album | null; members: Member[]; invites: Invite[]; error: string };

async function load(id: string): Promise<Loaded> {
  try {
    const album = await getAlbum(id);
    if (!album) return { album: null, members: [], invites: [], error: '' };
    const [members, invites] = await Promise.all([
      listMembers(id),
      album.my_role === 'owner' ? listInvites(id) : Promise.resolve([]),
    ]);
    return { album, members, invites, error: '' };
  } catch (e) {
    return { album: null, members: [], invites: [], error: errorMessage(e) };
  }
}

export default function AlbumSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session?.user.id;
  const [data, setData] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(() => load(id).then(setData), [id]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load(id).then((d) => active && setData(d));
      return () => {
        active = false;
      };
    }, [id]),
  );

  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!data.album) {
    return (
      <View style={styles.center}>
        <ErrorText>{data.error || 'このアルバムは見つかりませんでした。'}</ErrorText>
      </View>
    );
  }

  const album = data.album;
  const isOwner = album.my_role === 'owner';

  async function run(action: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function shareInvite(invite: Invite) {
    await Share.share({ message: inviteMessage(album.name, invite.token) });
  }

  function newInvite() {
    if (!me) return;
    run(async () => {
      const invite = await createInvite(album.id, me);
      await reload();
      await shareInvite(invite);
    });
  }

  function confirmRevoke(invite: Invite) {
    Alert.alert('この招待コードを取り消しますか？', `${invite.token}\n\n取り消すと、このコードでは参加できなくなります。参加済みの人はそのままです。`, [
      { text: 'やめる', style: 'cancel' },
      { text: '取り消す', style: 'destructive', onPress: () => run(async () => { await revokeInvite(invite.id); await reload(); }) },
    ]);
  }

  function confirmRemove(member: Member) {
    Alert.alert(
      `${member.display_name || 'このメンバー'} さんをアルバムから外しますか？`,
      'その人がアルバムに入れた思い出も、アルバムから外れます（その人の「未整理」に戻ります）。',
      [
        { text: 'やめる', style: 'cancel' },
        { text: '外す', style: 'destructive', onPress: () => run(async () => { await removeMember(album.id, member.user_id); await reload(); }) },
      ],
    );
  }

  function confirmLeave() {
    if (!me) return;
    Alert.alert('このアルバムから抜けますか？', 'あなたが入れた思い出はアルバムから外れ、あなたの「未整理」に戻ります。', [
      { text: 'やめる', style: 'cancel' },
      {
        text: '抜ける',
        style: 'destructive',
        onPress: () => run(async () => { await removeMember(album.id, me); router.dismissTo('/'); }),
      },
    ]);
  }

  function confirmDelete() {
    Alert.alert('アルバムを削除しますか？', '思い出は消えずに、それぞれ撮った人の「未整理」に戻ります。メンバーは全員アルバムから外れます。', [
      { text: 'やめる', style: 'cancel' },
      { text: '削除する', style: 'destructive', onPress: () => run(async () => { await deleteAlbum(album.id); router.dismissTo('/'); }) },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: album.name }} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>メンバー（{data.members.length} 人）</Text>
        {data.members.map((m) => (
          <View key={m.user_id} style={styles.row}>
            <Ionicons name="person-circle-outline" size={28} color={colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {m.display_name || '名前未設定'}
                {m.user_id === me ? '（あなた）' : ''}
              </Text>
              <Text style={styles.muted}>{roleLabel(m.role)}</Text>
            </View>
            {isOwner && m.role !== 'owner' && (
              <Pressable onPress={() => confirmRemove(m)} hitSlop={8}>
                <Text style={styles.danger}>外す</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>

      {isOwner && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>招待</Text>
          <Text style={styles.muted}>
            招待コードを作って、LINE やメールで送ります。受け取った人がアプリでコードを入力すると、メンバーになります。
          </Text>
          <Button title="招待コードを作って送る" onPress={newInvite} loading={busy} />
          {data.invites.length > 0 && (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <Text style={styles.muted}>有効な招待コード</Text>
              {data.invites.map((inv) => (
                <View key={inv.id} style={styles.row}>
                  <Text style={styles.code}>{inv.token}</Text>
                  <Pressable onPress={() => shareInvite(inv)} hitSlop={8}>
                    <Text style={styles.link}>送る</Text>
                  </Pressable>
                  <Pressable onPress={() => confirmRevoke(inv)} hitSlop={8}>
                    <Text style={styles.danger}>取り消す</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <ErrorText>{error}</ErrorText>

      {isOwner ? (
        <View style={{ gap: spacing.md }}>
          <Button
            title="アルバムの名前を変える"
            variant="secondary"
            onPress={() => router.push({ pathname: '/album/new', params: { id: album.id, name: album.name } })}
          />
          <Button title="アルバムを削除する" variant="secondary" onPress={confirmDelete} />
        </View>
      ) : (
        <Button title="このアルバムから抜ける" variant="secondary" onPress={confirmLeave} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  container: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
  name: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  code: { flex: 1, fontSize: 18, letterSpacing: 3, color: colors.text, fontWeight: '600' },
  link: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  danger: { color: colors.danger, fontSize: 14, fontWeight: '600' },
});
