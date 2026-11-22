import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { MemoryMapProps } from '@/components/MemoryMap';
import { formatDate } from '@/lib/format';
import { colors, spacing } from '@/theme';

// Web 版の代わりの表示（開発中の確認用。地図はスマホのアプリでのみ表示する）
export function MemoryMap({ memories, selectedId, onSelect }: MemoryMapProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.note}>地図はスマホのアプリで表示されます。</Text>
      <ScrollView contentContainerStyle={{ gap: spacing.sm }}>
        {memories.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => onSelect(m.id)}
            style={[styles.item, m.id === selectedId && { borderColor: colors.primary }]}
          >
            <Text style={styles.text}>
              {formatDate(m.taken_at)}（{m.latitude.toFixed(4)}, {m.longitude.toFixed(4)}）
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: spacing.md, paddingTop: 100, gap: spacing.md },
  note: { color: colors.textMuted },
  item: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  text: { color: colors.text },
});
