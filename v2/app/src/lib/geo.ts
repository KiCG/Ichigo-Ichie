// 位置の計算（解除用の Edge Function と同じ基準。最終的な判定はサーバーが行う）
export const UNLOCK_RADIUS_M = 100;
export const MAX_ACCURACY_M = 50;

export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// GPS の誤差を考慮して、解除できる距離にいるか
export function isWithinUnlockRange(distance: number, accuracy: number | null | undefined): boolean {
  const slack = Math.min(Math.max(accuracy ?? 0, 0), MAX_ACCURACY_M);
  return distance - slack <= UNLOCK_RADIUS_M;
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`;
}
