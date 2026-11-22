import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MemoryMap } from '@/components/MemoryMap';
import { Photo } from '@/components/Photo';
import { Button, ErrorText } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { distanceM, formatDistance, isWithinUnlockRange } from '@/lib/geo';
import { errorMessage, listMemories, type MemorySummary } from '@/lib/memories';
import { colors, spacing } from '@/theme';

type Loaded = { memories: MemorySummary[]; error: string };

async function load(): Promise<Loaded> {
  try {
    // 地図に出すのは封をした思い出だけ（下書きは解除するものがない）
    const memories = (await listMemories()).filter((m) => m.sealed_at);
    return { memories, error: '' };
  } catch (e) {
    return { memories: [], error: errorMessage(e) };
  }
}

export default function MapScreen() {
  const [data, setData] = useState<Loaded | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [position, setPosition] = useState<Location.LocationObject | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().then((d) => active && setData(d));
      return () => {
        active = false;
      };
    }, []),
  );

  // 許可をまだ聞いていなければ聞く
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  // 現在地を追う
  const granted = !!permission?.granted;
  useEffect(() => {
    if (!granted) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 10 }, setPosition)
      .then((s) => {
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [granted]);

  const memories = data?.memories ?? [];
  const selected = memories.find((m) => m.id === selectedId) ?? null;
  const center = position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : null;

  // 位置が分かるまで地図を出さない（初期位置を現在地にするため）。許可がない場合はすぐ出す
  const mapReady = data && (center || (permission && !permission.granted));

  return (
    <View style={styles.container}>
      {mapReady && <MemoryMap memories={memories} selectedId={selectedId} onSelect={setSelectedId} center={center} />}

      <SafeAreaView edges={['top']} style={styles.header} pointerEvents="box-none">
        <View style={styles.headerCard}>
          <Text style={styles.title}>マップ</Text>
          <Text style={styles.muted}>
            {memories.length > 0 ? `封をした思い出 ${memories.length} 件` : data ? '封をした思い出はまだありません' : '読み込み中…'}
          </Text>
        </View>
        {!!data?.error && <ErrorText>{data.error}</ErrorText>}
        {permission && !permission.granted && (
          <Text style={styles.warning}>位置情報を許可すると、現在地と思い出までの距離がわかります。</Text>
        )}
      </SafeAreaView>

      {selected && <SelectedCard memory={selected} position={position} onClose={() => setSelectedId(null)} />}
    </View>
  );
}

function SelectedCard({
  memory,
  position,
  onClose,
}: {
  memory: MemorySummary;
  position: Location.LocationObject | null;
  onClose: () => void;
}) {
  const distance = position
    ? distanceM(position.coords.latitude, position.coords.longitude, memory.latitude, memory.longitude)
    : null;
  const nearby = distance != null && isWithinUnlockRange(distance, position?.coords.accuracy);
  const locked = memory.sealed_count - memory.readable_count;

  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Photo path={memory.photo_path} style={styles.thumb} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.cardTitle}>{formatDate(memory.taken_at)}</Text>
          <View style={styles.inline}>
            <Ionicons name={locked > 0 ? 'lock-closed' : 'lock-open'} size={14} color={colors.primary} />
            <Text style={styles.muted}>{locked > 0 ? `ロック中 ${locked} 件` : 'すべて読めます'}</Text>
          </View>
          <Text style={styles.muted}>
            {distance == null ? '現在地がわかりません' : nearby ? 'この場所にいます' : `ここから ${formatDistance(distance)}`}
          </Text>
        </View>
        <Pressable accessibilityLabel="閉じる" onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
      <View style={styles.cardButtons}>
        <View style={{ flex: 1 }}>
          <Button
            title="思い出を見る"
            variant="secondary"
            onPress={() => router.push({ pathname: '/memory/[id]', params: { id: memory.id } })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={nearby ? 'ここで解除する' : '解除カメラを開く'}
            onPress={() => router.push({ pathname: '/unlock/[id]', params: { id: memory.id } })}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { position: 'absolute', top: 0, left: 0, right: 0, padding: spacing.md, gap: spacing.sm },
  headerCard: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,253,248,0.95)',
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  warning: {
    fontSize: 13,
    color: colors.text,
    backgroundColor: 'rgba(255,253,248,0.95)',
    padding: spacing.sm,
    borderRadius: 10,
  },
  card: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  thumb: { width: 72, height: 72, borderRadius: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardButtons: { flexDirection: 'row', gap: spacing.md },
});
