import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Photo } from '@/components/Photo';
import { formatShortDate } from '@/lib/format';
import type { MemorySummary } from '@/lib/memories';
import { colors } from '@/theme';

// 思い出一覧の1マス（写真と「下書き／封をした日」の印）
export function MemoryTile({ memory, size }: { memory: MemorySummary; size: number }) {
  const draft = !memory.sealed_at;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/memory/[id]', params: { id: memory.id } })}
      style={({ pressed }) => [{ width: size, height: size }, pressed && { opacity: 0.7 }]}
    >
      <Photo path={memory.photo_path} style={{ width: size, height: size }} />
      <View style={[styles.badge, draft ? styles.badgeDraft : styles.badgeSealed]}>
        <Ionicons name={draft ? 'create-outline' : 'lock-closed'} size={11} color={draft ? colors.text : colors.primaryText} />
        <Text style={[styles.badgeText, { color: draft ? colors.text : colors.primaryText }]}>
          {draft ? '下書き' : formatShortDate(memory.sealed_at)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
});
