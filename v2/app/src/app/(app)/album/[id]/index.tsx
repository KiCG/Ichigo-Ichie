import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { MemoryTile } from '@/components/MemoryTile';
import { ErrorText } from '@/components/ui';
import { type Album, getAlbum } from '@/lib/albums';
import { errorMessage, listMemories, type MemorySummary } from '@/lib/memories';
import { prefetchPhotoUrls } from '@/lib/photos';
import { colors, spacing } from '@/theme';

const COLUMNS = 3;
const GAP = 2;

type Loaded = { album: Album | null; memories: MemorySummary[]; error: string };

async function load(id: string): Promise<Loaded> {
  try {
    const [album, all] = await Promise.all([getAlbum(id), listMemories()]);
    const memories = all.filter((m) => m.album_id === id);
    await prefetchPhotoUrls(memories.map((m) => m.photo_path)).catch(() => {});
    return { album, memories, error: '' };
  } catch (e) {
    return { album: null, memories: [], error: errorMessage(e) };
  }
}

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const [data, setData] = useState<Loaded | null>(null);

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
  const tile = (width - GAP * (COLUMNS - 1)) / COLUMNS;
  const canAdd = album.my_role === 'owner' || album.my_role === 'editor';

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: album.name,
          headerRight: () => (
            <Pressable
              accessibilityLabel="アルバムの設定とメンバー"
              hitSlop={12}
              onPress={() => router.push({ pathname: '/album/[id]/settings', params: { id: album.id } })}
            >
              <Ionicons name="people-outline" size={24} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={data.memories}
        keyExtractor={(m) => m.id}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP, paddingBottom: spacing.xl, flexGrow: 1 }}
        renderItem={({ item }) => <MemoryTile memory={item} size={tile} />}
        ListHeaderComponent={
          <Pressable
            onPress={() => router.push({ pathname: '/album/[id]/settings', params: { id: album.id } })}
            style={styles.info}
          >
            <Ionicons name={album.member_count > 1 ? 'people' : 'person'} size={16} color={colors.textMuted} />
            <Text style={styles.infoText}>
              {album.member_count > 1 ? `${album.member_count} 人で共有中` : '自分だけのアルバム'}
              {album.my_role === 'owner' ? '（招待するにはここをタップ）' : ''}
            </Text>
          </Pressable>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {canAdd
                ? 'まだ思い出がありません。\n思い出の詳細画面の「アルバムに入れる」から追加できます。'
                : 'まだ思い出がありません。'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  info: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.md },
  infoText: { fontSize: 13, color: colors.textMuted, flexShrink: 1 },
  empty: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
});
