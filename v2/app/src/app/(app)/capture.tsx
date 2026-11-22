import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { type CapturedPhoto, createMemory, errorMessage } from '@/lib/memories';
import { colors, spacing } from '@/theme';

export default function CaptureScreen() {
  const { session } = useAuth();
  const camera = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const [position, setPosition] = useState<Location.LocationObject | null>(null);
  const [shot, setShot] = useState<CapturedPhoto | null>(null);
  const [taking, setTaking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // カメラを開いている間、現在地を追い続ける
  const locationGranted = !!locationPermission?.granted;
  useEffect(() => {
    if (!locationGranted) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 5 }, setPosition)
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

  if (!cameraPermission || !locationPermission) {
    return <View style={styles.black} />;
  }

  // 許可を求める画面
  if (!cameraPermission.granted || !locationPermission.granted) {
    const needCamera = !cameraPermission.granted;
    const permission = needCamera ? cameraPermission : locationPermission;
    const request = needCamera ? requestCameraPermission : requestLocationPermission;
    return (
      <SafeAreaView style={styles.permission}>
        <Ionicons name={needCamera ? 'camera-outline' : 'location-outline'} size={48} color={colors.primary} />
        <Text style={styles.permissionTitle}>{needCamera ? 'カメラを使わせてください' : '位置情報を使わせてください'}</Text>
        <Text style={styles.permissionText}>
          {needCamera
            ? '思い出の写真を撮るためにカメラを使います。'
            : '写真を撮った場所を記録します。同じ場所に戻ってきたときに、思い出を開けるようにするためです。'}
        </Text>
        {permission.canAskAgain ? (
          <Button title="許可する" onPress={request} />
        ) : (
          <Button title="設定アプリで許可する" onPress={() => Linking.openSettings()} />
        )}
        <Button title="やめる" variant="secondary" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  async function take() {
    if (!camera.current || taking) return;
    setError('');
    setTaking(true);
    try {
      const pos = position ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      const picture = await camera.current.takePictureAsync({ quality: 0.9 });
      setShot({
        uri: picture.uri,
        width: picture.width,
        height: picture.height,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        takenAt: new Date(),
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaking(false);
    }
  }

  async function save() {
    if (!shot || !session) return;
    setError('');
    setSaving(true);
    try {
      const id = await createMemory(session.user.id, shot);
      router.replace({ pathname: '/memory/[id]', params: { id, justCreated: '1' } });
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  // 撮った直後の確認画面（撮り直しができる）
  if (shot) {
    return (
      <View style={styles.black}>
        <Image source={{ uri: shot.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
        <SafeAreaView style={styles.previewBar} edges={['bottom']}>
          <ErrorText>{error}</ErrorText>
          <View style={styles.previewButtons}>
            <View style={{ flex: 1 }}>
              <Button title="撮り直す" variant="secondary" onPress={() => setShot(null)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="この写真で残す" onPress={save} loading={saving} />
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const accuracy = position?.coords.accuracy;

  return (
    <View style={styles.black}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable accessibilityLabel="閉じる" onPress={() => router.back()} hitSlop={12} style={styles.iconButton}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <View style={styles.locationPill}>
            <Ionicons name="location" size={14} color="#fff" />
            <Text style={styles.locationText}>
              {accuracy == null ? '現在地を取得中…' : `現在地 ±${Math.round(accuracy)}m`}
            </Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.bottomBar}>
          <ErrorText>{error}</ErrorText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="シャッター"
            onPress={take}
            disabled={taking}
            style={({ pressed }) => [styles.shutter, (pressed || taking) && { opacity: 0.6 }]}
          >
            {taking ? <ActivityIndicator color={colors.primary} /> : <View style={styles.shutterInner} />}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  locationText: { color: '#fff', fontSize: 13 },
  bottomBar: { alignItems: 'center', paddingBottom: spacing.lg, gap: spacing.sm },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  previewBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  previewButtons: { flexDirection: 'row', gap: spacing.md },
  permission: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  permissionText: { fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
