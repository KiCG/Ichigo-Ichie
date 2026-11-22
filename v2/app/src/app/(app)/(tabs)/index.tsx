import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Photo } from '@/components/Photo';
import { ErrorText } from '@/components/ui';
import { formatShortDate } from '@/lib/format';
import { errorMessage, getPhotoUsage, listMemories, type MemorySummary } from '@/lib/memories';
import { prefetchPhotoUrls } from '@/lib/photos';
import { colors, spacing } from '@/theme';

const COLUMNS = 3;
const GAP = 2;

type Loaded = { memories: MemorySummary[]; usage: { used: number; photo_limit: number } | null; error: string };

async function load(): Promise<Loaded> {
  try {
    const [memories, usage] = await Promise.all([listMemories(), getPhotoUsage()]);
    await prefetchPhotoUrls(memories.map((m) => m.photo_path)).catch(() => {});
    return { memories, usage, error: '' };
  } catch (e) {
    return { memories: [], usage: null, error: errorMessage(e) };
  }
}

export default function MemoriesScreen() {
  const { width } = useWindowDimensions();
  const [data, setData] = useState<Loaded | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 画面に戻ってくるたびに読み直す
  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().then((d) => active && setData(d));
      return () => {
        active = false;
      };
    }, []),
  );

  async function refresh() {
    setRefreshing(true);
    setData(await load());
    setRefreshing(false);
  }

  const tile = (width - GAP * (COLUMNS - 1)) / COLUMNS;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>思い出</Text>
        {data?.usage && (
          <Text style={styles.muted}>
            写真 {data.usage.used} / {data.usage.photo_limit} 枚
          </Text>
        )}
      </View>
      {!!data?.error && (
        <View style={{ paddingHorizontal: spacing.md }}>
          <ErrorText>{data.error}</ErrorText>
        </View>
      )}

      <FlatList
        data={data?.memories ?? []}
        keyExtractor={(m) => m.id}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP, paddingBottom: 120, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        renderItem={({ item }) => <Tile memory={item} size={tile} />}
        ListEmptyComponent={
          data && !data.error ? (
            <View style={styles.empty}>
              <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>まだ思い出がありません</Text>
              <Text style={styles.muted}>下の「撮る」から、最初の思い出を残しましょう。</Text>
            </View>
          ) : !data ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : undefined
        }
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="写真を撮る"
        onPress={() => router.push('/capture')}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.8 }]}
      >
        <Ionicons name="camera" size={26} color={colors.primaryText} />
        <Text style={styles.fabText}>撮る</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function Tile({ memory, size }: { memory: MemorySummary; size: number }) {
  const draft = !memory.sealed_at;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/memory/[id]', params: { id: memory.id } })}
      style={({ pressed }) => [{ width: size, height: size }, pressed && { opacity: 0.7 }]}
    >
      <Photo path={memory.photo_path} style={{ width: size, height: size }} />
      <View style={[styles.badge, draft ? styles.badgeDraft : styles.badgeSealed]}>
        <Ionicons
          name={draft ? 'create-outline' : 'lock-closed'}
          size={11}
          color={draft ? colors.text : colors.primaryText}
        />
        <Text style={[styles.badgeText, { color: draft ? colors.text : colors.primaryText }]}>
          {draft ? '下書き' : formatShortDate(memory.sealed_at)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: 2 },
  muted: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  badge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeDraft: { backgroundColor: 'rgba(255,253,248,0.9)' },
  badgeSealed: { backgroundColor: 'rgba(139,74,43,0.9)' },
  badgeText: { fontSize: 10, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    height: 56,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
});
