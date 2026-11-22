// 非公開の写真を表示するための、期限つき URL の取得とキャッシュ
import { useEffect, useState } from 'react';

import { BUCKET } from '@/lib/memories';
import { supabase } from '@/lib/supabase';

const EXPIRES_IN = 60 * 60; // 1時間
const cache = new Map<string, { url: string; expiresAt: number }>();

function cached(path: string): string | null {
  const hit = cache.get(path);
  // 期限の5分前からは取り直す
  return hit && hit.expiresAt - 5 * 60 * 1000 > Date.now() ? hit.url : null;
}

// まとめて取得する（一覧画面で1回の通信で済ませる）
export async function prefetchPhotoUrls(paths: string[]) {
  const missing = [...new Set(paths)].filter((p) => !cached(p));
  if (missing.length === 0) return;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, EXPIRES_IN);
  if (error) throw error;
  const expiresAt = Date.now() + EXPIRES_IN * 1000;
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) cache.set(item.path, { url: item.signedUrl, expiresAt });
  }
}

export async function getPhotoUrl(path: string): Promise<string | null> {
  const hit = cached(path);
  if (hit) return hit;
  await prefetchPhotoUrls([path]);
  return cached(path);
}

export function usePhotoUrl(path: string | null | undefined): string | null {
  const [state, setState] = useState<{ path: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!path || cached(path)) return;
    let active = true;
    getPhotoUrl(path)
      .then((url) => active && setState({ path, url }))
      .catch(() => active && setState({ path, url: null }));
    return () => {
      active = false;
    };
  }, [path]);

  if (!path) return null;
  return cached(path) ?? (state?.path === path ? state.url : null);
}
