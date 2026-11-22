import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { Photo } from '@/components/Photo';
import { Button, ErrorText } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import {
  createAddendum,
  deleteMemory,
  errorMessage,
  getMemory,
  getMessages,
  listVisits,
  type MemoryMessage,
  type MemorySummary,
  saveDraft,
  sealMessage,
  type Visit,
} from '@/lib/memories';
import { colors, spacing } from '@/theme';

type Loaded = { memory: MemorySummary | null; messages: MemoryMessage[]; visits: Visit[]; error: string };

async function load(id: string): Promise<Loaded> {
  try {
    const [memory, messages, visits] = await Promise.all([getMemory(id), getMessages(id), listVisits(id)]);
    return { memory, messages, visits, error: '' };
  } catch (e) {
    return { memory: null, messages: [], visits: [], error: errorMessage(e) };
  }
}

export default function MemoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Loaded | null>(null);

  const reload = useCallback(() => load(id).then(setData), [id]);

  // 解除画面などから戻ってきたときにも読み直す
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
  if (!data.memory) {
    return (
      <View style={styles.center}>
        <ErrorText>{data.error || 'この思い出は見つかりませんでした。'}</ErrorText>
      </View>
    );
  }
  return <MemoryDetail memory={data.memory} messages={data.messages} visits={data.visits} onChanged={reload} />;
}

function MemoryDetail({
  memory,
  messages,
  visits,
  onChanged,
}: {
  memory: MemorySummary;
  messages: MemoryMessage[];
  visits: Visit[];
  onChanged: () => Promise<void>;
}) {
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const isOwner = session?.user.id === memory.owner_id;
  const isDraft = !memory.sealed_at;
  const original = messages.find((m) => m.is_original);
  const readable = messages.filter((m) => m.sealed_at && m.is_readable);
  const myAddendumDraft = messages.find((m) => !m.is_original && !m.sealed_at && m.author_id === session?.user.id);
  const visitPhotos = visits.filter((v) => v.photo_path);
  const [creatingAddendum, setCreatingAddendum] = useState(false);

  async function startAddendum() {
    if (!session) return;
    setError('');
    setCreatingAddendum(true);
    try {
      await createAddendum(memory.id, session.user.id);
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreatingAddendum(false);
    }
  }
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  function confirmDelete() {
    Alert.alert('この思い出を消しますか？', '写真とメッセージが消え、元に戻せません。', [
      { text: 'やめる', style: 'cancel' },
      {
        text: '消す',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteMemory(memory);
            router.back();
          } catch (e) {
            setError(errorMessage(e));
            setDeleting(false);
          }
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: formatDate(memory.taken_at) }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Photo path={memory.photo_path} style={{ width: width - spacing.md * 2, aspectRatio: 3 / 4, borderRadius: 12 }} />

        {isDraft && isOwner && original ? (
          <DraftEditor kind="original" messageId={original.id} initialBody={original.body ?? ''} onSealed={onChanged} />
        ) : (
          <>
            <SealedCard memory={memory} />
            <Button
              title="この場所で解除する"
              onPress={() => router.push({ pathname: '/unlock/[id]', params: { id: memory.id } })}
            />
          </>
        )}

        {readable.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>読めるメッセージ</Text>
            {readable.map((m) => (
              <View key={m.id} style={styles.message}>
                <Text style={styles.messageMeta}>
                  {m.is_original ? '元のメッセージ' : '追記'} ・ {formatDate(m.sealed_at)} に封
                </Text>
                <Text style={styles.messageBody}>{m.body}</Text>
              </View>
            ))}
          </View>
        )}

        {!isDraft &&
          (myAddendumDraft ? (
            <DraftEditor
              key={myAddendumDraft.id}
              kind="addendum"
              messageId={myAddendumDraft.id}
              initialBody={myAddendumDraft.body ?? ''}
              onSealed={onChanged}
            />
          ) : memory.my_unlock_count > 0 ? (
            <Button title="追記を書く" variant="secondary" onPress={startAddendum} loading={creatingAddendum} />
          ) : (
            <Text style={styles.note}>現地で解除すると、追記を書けるようになります。</Text>
          ))}

        {visitPhotos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>訪問写真</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {visitPhotos.map((v) => (
                <View key={v.id} style={{ gap: 4 }}>
                  <Photo path={v.photo_path!} style={styles.visitPhoto} />
                  <Text style={styles.messageMeta}>{formatDate(v.unlocked_at)}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <ErrorText>{error}</ErrorText>
        {isOwner && (
          <View style={{ marginTop: spacing.lg }}>
            <Button title="この思い出を消す" variant="secondary" onPress={confirmDelete} loading={deleting} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// 下書きを書き、封をする
function DraftEditor({
  kind,
  messageId,
  initialBody,
  onSealed,
}: {
  kind: 'original' | 'addendum';
  messageId: string;
  initialBody: string;
  onSealed: () => Promise<void>;
}) {
  const [body, setBody] = useState(initialBody);
  const [savedBody, setSavedBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [error, setError] = useState('');
  const dirty = body !== savedBody;

  async function save() {
    setError('');
    setSaving(true);
    try {
      await saveDraft(messageId, body);
      setSavedBody(body);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function confirmSeal() {
    if (!body.trim()) {
      setError('メッセージを書いてから封をしてください。');
      return;
    }
    Alert.alert(
      '封をしますか？',
      '封をすると、あなた自身も読めなくなり、書き直すこともできません。\n\nこの場所でもう一度撮影すると読めるようになります。解除できるのは、封をした翌日以降です。',
      [
        { text: 'やめる', style: 'cancel' },
        {
          text: '封をする',
          onPress: async () => {
            setError('');
            setSealing(true);
            try {
              if (dirty) await saveDraft(messageId, body);
              await sealMessage(messageId);
              await onSealed();
            } catch (e) {
              setError(errorMessage(e));
              setSealing(false);
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.statusRow}>
        <Ionicons name="create-outline" size={16} color={colors.textMuted} />
        <Text style={styles.statusText}>
          {kind === 'original' ? '下書き' : '追記の下書き'}（あなただけが読めます。いつでも書き直せます）
        </Text>
      </View>
      <TextInput
        value={body}
        onChangeText={setBody}
        onBlur={() => dirty && save()}
        placeholder={kind === 'original' ? 'その時、その場所で、何を思った？' : 'もう一度ここに来て、何を思った？'}
        placeholderTextColor={colors.textMuted}
        multiline
        style={styles.editor}
        textAlignVertical="top"
      />
      <Text style={styles.hint}>{saving ? '保存中…' : dirty ? '未保存の変更があります' : '保存済み'}</Text>
      <ErrorText>{error}</ErrorText>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button title="下書きを保存" variant="secondary" onPress={save} loading={saving} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="封をする" onPress={confirmSeal} loading={sealing} />
        </View>
      </View>
    </View>
  );
}

function SealedCard({ memory }: { memory: MemorySummary }) {
  const locked = memory.sealed_count - memory.readable_count;
  return (
    <View style={[styles.section, styles.sealed]}>
      <View style={styles.statusRow}>
        <Ionicons name="lock-closed" size={18} color={colors.primary} />
        <Text style={styles.sealedTitle}>{formatDate(memory.sealed_at)} に封をしました</Text>
      </View>
      {locked > 0 ? (
        <Text style={styles.sealedText}>
          ロック中のメッセージが {locked} 件あります。{'\n'}
          この場所でもう一度撮影すると読めるようになります（封をした翌日以降）。
        </Text>
      ) : (
        <Text style={styles.sealedText}>封をしたメッセージはすべて読めます。</Text>
      )}
    </View>
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
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { fontSize: 13, color: colors.textMuted, flexShrink: 1 },
  editor: {
    minHeight: 160,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'right' },
  row: { flexDirection: 'row', gap: spacing.md },
  sealed: { borderColor: colors.primary },
  sealedTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  sealedText: { fontSize: 14, color: colors.textMuted, lineHeight: 21 },
  note: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  visitPhoto: { width: 96, height: 128, borderRadius: 8 },
  message: { gap: 4, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  messageMeta: { fontSize: 12, color: colors.textMuted },
  messageBody: { fontSize: 16, color: colors.text, lineHeight: 24 },
});
