import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Photo } from '@/components/Photo';
import { Button, ErrorText } from '@/components/ui';
import { distanceM, formatDistance, isWithinUnlockRange } from '@/lib/geo';
import { errorMessage, getMemory, type MemorySummary } from '@/lib/memories';
import { unlockMemory } from '@/lib/unlock';
import { colors, spacing } from '@/theme';

type Outcome =
  | { kind: 'unlocked'; newlyReadable: number; stillLocked: number; photoNote: string }
  | { kind: 'not_matched' }
  | { kind: 'too_far'; distanceM: number };

export default function UnlockScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const camera = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const [memory, setMemory] = useState<MemorySummary | null>(null);
  const [position, setPosition] = useState<Location.LocationObject | null>(null);
  const [savePhoto, setSavePhoto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getMemory(id)
      .then((m) => active && setMemory(m))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [id]);

  const locationGranted = !!locationPermission?.granted;
  useEffect(() => {
    if (!locationGranted) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 3 }, setPosition)
      .then((s) => {
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [locationGranted]);

  if (!cameraPermission || !locationPermission) return <View style={styles.black} />;

  if (!cameraPermission.granted || !locationPermission.granted) {
    const needCamera = !cameraPermission.granted;
    const permission = needCamera ? cameraPermission : locationPermission;
    const request = needCamera ? requestCameraPermission : requestLocationPermission;
    return (
      <SafeAreaView style={styles.page}>
        <Ionicons name={needCamera ? 'camera-outline' : 'location-outline'} size={48} color={colors.primary} style={{ alignSelf: 'center' }} />
        <Text style={styles.pageTitle}>{needCamera ? 'カメラを使わせてください' : '位置情報を使わせてください'}</Text>
        <Text style={styles.pageText}>思い出を開くには、撮影した場所で、同じ風景を撮る必要があります。</Text>
        {permission.canAskAgain ? (
          <Button title="許可する" onPress={request} />
        ) : (
          <Button title="設定アプリで許可する" onPress={() => Linking.openSettings()} />
        )}
        <Button title="やめる" variant="secondary" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  if (outcome) {
    return <OutcomeView outcome={outcome} memoryId={id} onRetry={() => setOutcome(null)} />;
  }

  const distance =
    memory && position
      ? distanceM(position.coords.latitude, position.coords.longitude, memory.latitude, memory.longitude)
      : null;
  const nearby = distance != null && isWithinUnlockRange(distance, position?.coords.accuracy);

  async function shoot() {
    if (!camera.current || !memory || busy) return;
    setError('');
    setBusy(true);
    try {
      const pos = position ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      const picture = await camera.current.takePictureAsync({ quality: 0.9 });
      const before = memory.readable_count;
      const result = await unlockMemory({
        memoryId: memory.id,
        photo: picture,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        savePhoto,
      });
      if (result.kind === 'error') {
        setError(result.message);
      } else if (result.kind === 'unlocked') {
        const after = await getMemory(memory.id);
        const readable = after?.readable_count ?? before;
        setOutcome({
          kind: 'unlocked',
          newlyReadable: Math.max(readable - before, 0),
          stillLocked: (after?.sealed_count ?? 0) - readable,
          photoNote:
            result.photoError === 'photo_limit'
              ? '写真の保存上限に達しているため、今回の写真は保存しませんでした。'
              : result.photoError
                ? '今回の写真は保存できませんでした。'
                : result.photoSaved
                  ? '今回の写真を訪問写真として保存しました。'
                  : '',
        });
      } else if (result.kind === 'too_far') {
        setOutcome({ kind: 'too_far', distanceM: result.distanceM });
      } else {
        setOutcome({ kind: 'not_matched' });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.black}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable accessibilityLabel="閉じる" onPress={() => router.back()} hitSlop={12} style={styles.iconButton}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <View style={styles.pill}>
            <Ionicons name="location" size={14} color="#fff" />
            <Text style={styles.pillText}>
              {distance == null ? '現在地を取得中…' : nearby ? '撮影した場所にいます' : `撮影した場所まで ${formatDistance(distance)}`}
            </Text>
          </View>
          {memory ? (
            <View style={styles.thumbWrap}>
              <Photo path={memory.photo_path} style={styles.thumb} />
              <Text style={styles.thumbLabel}>元の写真</Text>
            </View>
          ) : (
            <View style={{ width: 72 }} />
          )}
        </View>

        <View style={styles.bottom}>
          <Text style={styles.hint}>元の写真と同じ風景を撮ってください。季節や時間が違っても大丈夫です。</Text>
          <ErrorText>{error}</ErrorText>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>今回の写真を訪問写真として残す</Text>
            <Switch value={savePhoto} onValueChange={setSavePhoto} trackColor={{ true: colors.primary }} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="撮影して解除する"
            onPress={shoot}
            disabled={busy || !memory}
            style={({ pressed }) => [styles.shutter, (pressed || busy) && { opacity: 0.6 }]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="key" size={30} color="#fff" />}
          </Pressable>
          {busy && <Text style={styles.hint}>確かめています…</Text>}
        </View>
      </SafeAreaView>
    </View>
  );
}

function OutcomeView({ outcome, memoryId, onRetry }: { outcome: Outcome; memoryId: string; onRetry: () => void }) {
  if (outcome.kind === 'unlocked') {
    return (
      <SafeAreaView style={styles.page}>
        <Ionicons name="lock-open" size={56} color={colors.primary} style={{ alignSelf: 'center' }} />
        <Text style={styles.pageTitle}>思い出が開きました</Text>
        <Text style={styles.pageText}>
          {outcome.newlyReadable > 0
            ? `${outcome.newlyReadable} 件のメッセージが読めるようになりました。`
            : '新しく読めるようになったメッセージはありません。'}
          {outcome.stillLocked > 0 &&
            `\n\nまだロック中のメッセージが ${outcome.stillLocked} 件あります。今日封をされたメッセージは、明日以降の訪問で読めます。`}
          {outcome.photoNote && `\n\n${outcome.photoNote}`}
        </Text>
        <Button
          title="思い出を開く"
          onPress={() => router.replace({ pathname: '/memory/[id]', params: { id: memoryId } })}
        />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.page}>
      <Ionicons name={outcome.kind === 'too_far' ? 'walk-outline' : 'help-circle-outline'} size={56} color={colors.primary} style={{ alignSelf: 'center' }} />
      <Text style={styles.pageTitle}>{outcome.kind === 'too_far' ? 'まだ少し遠いようです' : '同じ場所だと判定されませんでした'}</Text>
      <Text style={styles.pageText}>
        {outcome.kind === 'too_far'
          ? `撮影した場所まで、あと約 ${formatDistance(outcome.distanceM)} です。もう少し近づいてから撮ってください。`
          : '元の写真と同じ方向を向いて、建物や風景が写るように、もう一度撮ってみてください。'}
      </Text>
      <Button title="もう一度撮る" onPress={onRetry} />
      <Button title="やめる" variant="secondary" onPress={() => router.back()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: spacing.md },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 8,
    flexShrink: 1,
  },
  pillText: { color: '#fff', fontSize: 13 },
  thumbWrap: { alignItems: 'center', gap: 2 },
  thumb: { width: 72, height: 96, borderRadius: 8, borderWidth: 2, borderColor: '#fff' },
  thumbLabel: { color: '#fff', fontSize: 11 },
  bottom: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  hint: { color: '#fff', fontSize: 13, textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  switchLabel: { color: '#fff', fontSize: 14 },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'stretch',
    padding: spacing.lg,
    gap: spacing.md,
  },
  pageTitle: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  pageText: { fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 23 },
});
