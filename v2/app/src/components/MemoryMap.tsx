import { useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import type { MemorySummary } from '@/lib/memories';
import { colors } from '@/theme';

export type MemoryMapProps = {
  memories: MemorySummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  center: { latitude: number; longitude: number } | null;
};

// 思い出の場所を地図に表示する（iOS / Android）
export function MemoryMap({ memories, selectedId, onSelect, center }: MemoryMapProps) {
  // 最初に表示する場所（現在地 → 最初の思い出 → 東京駅）。あとから変えない
  const [initial] = useState(
    () =>
      center ??
      (memories[0] ? { latitude: memories[0].latitude, longitude: memories[0].longitude } : null) ?? {
        latitude: 35.681236,
        longitude: 139.767125,
      },
  );

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      initialRegion={{ ...initial, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
      showsUserLocation
      showsMyLocationButton
      onPress={(e) => {
        // マーカー以外を押したら選択を外す
        if (e.nativeEvent.action !== 'marker-press') onSelect(null);
      }}
    >
      {memories.map((m) => (
        <Marker
          key={m.id}
          coordinate={{ latitude: m.latitude, longitude: m.longitude }}
          pinColor={m.id === selectedId ? colors.text : colors.primary}
          onPress={() => onSelect(m.id)}
          tracksViewChanges={false}
        />
      ))}
    </MapView>
  );
}
