import { Image, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

import { usePhotoUrl } from '@/lib/photos';
import { colors } from '@/theme';

// Storage 上の写真を表示する。URL は期限つきで毎回変わるので、キャッシュはパスで行う
export function Photo({
  path,
  style,
  contentFit = 'cover',
}: {
  path: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain';
}) {
  const url = usePhotoUrl(path);
  return (
    <Image
      source={url ? { uri: url, cacheKey: path } : null}
      style={[{ backgroundColor: colors.border }, style]}
      contentFit={contentFit}
      transition={150}
      recyclingKey={path}
    />
  );
}
