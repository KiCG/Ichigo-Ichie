import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorText } from '@/components/ui';
import { type Album, listAlbums, moveMemoryToAlbum, removeMemoryFromAlbum } from '@/lib/albums';
import { errorMessage, getMemory, type MemorySummary } from '@/lib/memories';
import { colors, spacing } from '@/theme';

// 思い出を入れるアルバムを選ぶ（思い出の持ち主用）
export default function MoveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [memory, setMemory] = useState<MemorySummary | null>(null);
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([getMemory(id), listAlbums()])
      .then(([m, a]) => {
        if (!active) return;
        setMemory(m);
        // 思い出を入れられるのは、持ち主・メンバーとして参加しているアルバム
        setAlbums(a.filter((x) => x.my_role === 'owner' || x.my_role === 'editor'));
      })
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [id]);

  async function choose(albumId: string | null) {
    if (!memory || busy) return;
    if (albumId === memory.album_id) {
      router.back();
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (albumId) await moveMemoryToAlbum(memory.id, albumId);
      else await removeMemoryFromAlbum(memory.id);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  if (!albums || !memory) {
    return (
      <View style={styles.center}>
        {error ? <ErrorText>{error}</ErrorText> : <ActivityIndicator color={colors.primary} />}
      </View>
    );
  }

  const draft = !memory.sealed_at;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {draft && (
        <Text style={styles.note}>
          下書きのうちは、共有アルバムに入れても他のメンバーには見えません。封をすると見えるようになります。
        </Text>
      )}
      <Option icon="file-tray-outline" label="未整理（どのアルバムにも入れない）" selected={!memory.album_id} onPress={() => choose(null)} />
      {albums.map((a) => (
        <Option
          key={a.id}
          icon={a.member_count > 1 ? 'people-outline' : 'albums-outline'}
          label={a.name}
          sub={a.member_count > 1 ? `${a.member_count} 人で共有中` : undefined}
          selected={memory.album_id === a.id}
          onPress={() => choose(a.id)}
        />
      ))}
      {albums.length === 0 && <Text style={styles.note}>アルバムがまだありません。「思い出」タブから作れます。</Text>}
      <ErrorText>{error}</ErrorText>
      {busy && <ActivityIndicator color={colors.primary} />}
    </ScrollView>
  );
}

function Option({
  icon,
  label,
  sub,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.option, selected && styles.selected, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={22} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {sub && <Text style={styles.sub}>{sub}</Text>}
      </View>
      {selected && <Ionicons name="checkmark" size={22} color={colors.primary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  container: { padding: spacing.md, gap: spacing.sm },
  note: { fontSize: 13, color: colors.textMuted, lineHeight: 20, paddingVertical: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.primary },
  label: { fontSize: 15, color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted },
});
