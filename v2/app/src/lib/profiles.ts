// 表示名の取得（自分と、同じアルバムのメンバーの名前だけ読める）
import { supabase } from '@/lib/supabase';

const cache = new Map<string, string>();

export async function getDisplayNames(ids: string[]): Promise<Record<string, string>> {
  const missing = [...new Set(ids)].filter((id) => !cache.has(id));
  if (missing.length > 0) {
    const { data } = await supabase.from('profiles').select('id, display_name').in('id', missing);
    for (const row of data ?? []) cache.set(row.id, row.display_name || '名前未設定');
  }
  return Object.fromEntries(ids.map((id) => [id, cache.get(id) ?? '（アルバムを抜けた人）']));
}
