// 解除用の Edge Function の呼び出し
import { FunctionsHttpError } from '@supabase/supabase-js';
import { File } from 'expo-file-system';

import { preparePhoto } from '@/lib/memories';
import { supabase } from '@/lib/supabase';

export type UnlockResult =
  | { kind: 'unlocked'; unlockId: string; photoSaved: boolean; photoError?: 'photo_limit' | 'save_failed' }
  | { kind: 'too_far'; distanceM: number }
  | { kind: 'not_matched' }
  | { kind: 'error'; message: string };

export async function unlockMemory(input: {
  memoryId: string;
  photo: { uri: string; width: number; height: number };
  latitude: number;
  longitude: number;
  accuracy: number | null;
  savePhoto: boolean;
}): Promise<UnlockResult> {
  const jpegUri = await preparePhoto(input.photo);

  const form = new FormData();
  form.append('memory_id', input.memoryId);
  form.append('latitude', String(input.latitude));
  form.append('longitude', String(input.longitude));
  form.append('accuracy', String(input.accuracy ?? 0));
  form.append('save_photo', input.savePhoto ? 'true' : 'false');
  // SDK 58 の fetch（expo/fetch）は { uri, name, type } 形式を送れないので、
  // expo-file-system の File（Blob として扱える）をそのまま添付する
  form.append('photo', new File(jpegUri));

  const { data, error } = await supabase.functions.invoke('unlock', { body: form });

  if (error) {
    let code = '';
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      code = body?.error ?? '';
    }
    return { kind: 'error', message: unlockErrorMessage(code, error.message) };
  }

  if (data?.matched) {
    return { kind: 'unlocked', unlockId: data.unlock_id, photoSaved: !!data.photo_saved, photoError: data.photo_error };
  }
  if (data?.reason === 'too_far') return { kind: 'too_far', distanceM: data.distance_m };
  return { kind: 'not_matched' };
}

function unlockErrorMessage(code: string, fallback: string): string {
  switch (code) {
    case 'unauthorized':
      return 'ログインし直してから、もう一度試してください。';
    case 'not_found':
      return 'この思い出は見つかりませんでした。';
    case 'judge_failed':
      return '写真の判定に失敗しました。少し待ってから、もう一度撮ってみてください。';
    case 'bad_request':
      return '写真を送れませんでした。もう一度撮ってみてください。';
    default:
      return `解除できませんでした：${fallback}`;
  }
}
