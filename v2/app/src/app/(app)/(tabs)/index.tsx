import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MemoryTile } from '@/components/MemoryTile';
import { Photo } from '@/components/Photo';
import { ErrorText } from '@/components/ui';
import { type Album, listAlbums } from '@/lib/albums';
import { useAuth } from '@/lib/auth';
import { errorMessage, getPhotoUsage, listMemories, type MemorySummary } from '@/lib/memories';
import { prefetchPhotoUrls } from '@/lib/photos';
import { colors, spacing } from '@/theme';

const COLUMNS = 3;
const GAP = 2;

type Loaded = {
  albums: Album[];
  unsorted: MemorySummary[];
  usage: { used: number; photo_limit: number } | null;
  error: string;
};

async function load(userId: string | undefined): Promise<Loaded> {
  try {
    const [albums, memories, usage] = await Promise.all([listAlbums(), listMemories(), getPhotoUsage()]);
    // 未整理 = 自分の思い出で、どのアルバムにも入っていないもの
    const unsorted = memories.filter((m) => m.owner_id === userId && !m.album_id);
    const paths = [...unsorted.map((m) => m.photo_path), ...albums.flatMap((a) => (a.cover_photo_path ? [a.cover_photo_path] : []))];
    await prefetchPhotoUrls(paths).catch(() => {});
    return { albums, unsorted, usage, error: '' };
  } catch (e) {
    return { albums: [], unsorted: [], usage: null, error: errorMessage(e) };
  }
}

export default function MemoriesScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { width } = useWindowDimensions();
  const [data, setData] = useState<Loaded | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 画面に戻ってくるたびに読み直す
  useFocusEffect(
    useCallback(() => {
      let active = true;
      load(userId).then((d) => active && setData(d));
      return () => {
        active = false;
      };
    }, [userId]),
  );

  async function refresh() {
    setRefreshing(true);
    setData(await load(userId));
    setRefreshing(false);
  }

  const tile = (width - GAP * (COLUMNS - 1)) / COLUMNS;

  const header = (
    <View>
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

      <Text style={styles.sectionTitle}>アルバム</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumRow}>
        {data?.albums.map((a) => <AlbumCard key={a.id} album={a} />)}
        <ActionCard icon="add" label="新しいアルバム" onPress={() => router.push('/album/new')} />
        <ActionCard icon="enter-outline" label="招待コードで参加" onPress={() => router.push('/join')} />
      </ScrollView>

      <Text style={styles.sectionTitle}>未整理</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={data?.unsorted ?? []}
        keyExtractor={(m) => m.id}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP, paddingBottom: 120, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        ListHeaderComponent={header}
        renderItem={({ item }) => <MemoryTile memory={item} size={tile} />}
        ListEmptyComponent={
          data && !data.error ? (
            <View style={styles.empty}>
              <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
              <Text style={styles.muted}>
                {data.albums.length > 0
                  ? 'アルバムに入れていない思い出はありません。'
                  : '下の「撮る」から、最初の思い出を残しましょう。'}
              </Text>
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

function AlbumCard({ album }: { album: Album }) {
  const shared = album.member_count > 1;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/album/[id]', params: { id: album.id } })}
      style={({ pressed }) => [styles.albumCard, pressed && { opacity: 0.7 }]}
    >
      {album.cover_photo_path ? (
        <Photo path={album.cover_photo_path} style={styles.albumCover} />
      ) : (
        <View style={[styles.albumCover, styles.albumCoverEmpty]}>
          <Ionicons name="albums-outline" size={28} color={colors.textMuted} />
        </View>
      )}
      <Text style={styles.albumName} numberOfLines={1}>
        {album.name}
      </Text>
      <View style={styles.inline}>
        {shared && <Ionicons name="people" size={12} color={colors.textMuted} />}
        <Text style={styles.small}>
          {album.memory_count} 件{shared ? ` ・ ${album.member_count} 人` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

function ActionCard({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.albumCard, pressed && { opacity: 0.7 }]}>
      <View style={[styles.albumCover, styles.actionCover]}>
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={[styles.albumName, { color: colors.primary }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const CARD = 112;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, letterSpacing: 2 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  muted: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  small: { fontSize: 12, color: colors.textMuted },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  albumRow: { paddingHorizontal: spacing.md, gap: spacing.md },
  albumCard: { width: CARD, gap: 4 },
  albumCover: { width: CARD, height: CARD, borderRadius: 12 },
  albumCoverEmpty: { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  actionCover: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumName: { fontSize: 14, fontWeight: '600', color: colors.text },
  empty: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
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
