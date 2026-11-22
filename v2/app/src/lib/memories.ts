// 思い出・メッセージの読み書き
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';

export const BUCKET = 'photos';
const MAX_PHOTO_SIDE = 1600; // 保存する写真の長辺（ピクセル）

// visible_memories() が返す1件
export type MemorySummary = {
  id: string;
  owner_id: string;
  album_id: string | null;
  photo_path: string;
  latitude: number;
  longitude: number;
  taken_at: string;
  created_at: string;
  original_message_id: string | null;
  sealed_at: string | null; // null = 下書き
  sealed_count: number;
  readable_count: number;
  my_unlock_count: number;
  last_unlocked_at: string | null;
};

// memory_messages() が返す1件
export type MemoryMessage = {
  id: string;
  author_id: string;
  is_original: boolean;
  sealed_at: string | null;
  is_readable: boolean;
  body: string | null; // ロック中は null
};

export type CapturedPhoto = {
  uri: string;
  width: number;
  height: number;
  latitude: number;
  longitude: number;
  takenAt: Date;
};

// 撮った写真を、送りやすい大きさの JPEG にする
export async function preparePhoto(photo: { uri: string; width: number; height: number }) {
  const context = ImageManipulator.manipulate(photo.uri);
  const longSide = Math.max(photo.width, photo.height);
  if (longSide > MAX_PHOTO_SIDE) {
    context.resize(
      photo.width >= photo.height ? { width: MAX_PHOTO_SIDE, height: null } : { width: null, height: MAX_PHOTO_SIDE },
    );
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return result.uri;
}

// 思い出を作る：写真をアップロード → 思い出を登録 → 元のメッセージ（空の下書き）を作る
export async function createMemory(userId: string, photo: CapturedPhoto): Promise<string> {
  const id = Crypto.randomUUID().toLowerCase();
  const path = `${userId}/${id}.jpg`;

  const jpegUri = await preparePhoto(photo);
  const bytes = await new File(jpegUri).arrayBuffer();

  const upload = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg' });
  if (upload.error) throw upload.error;

  const { error } = await supabase.from('memories').insert({
    id,
    owner_id: userId,
    photo_path: path,
    latitude: photo.latitude,
    longitude: photo.longitude,
    taken_at: photo.takenAt.toISOString(),
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }

  const msg = await supabase
    .from('messages')
    .insert({ memory_id: id, author_id: userId, is_original: true, body: '' });
  if (msg.error) throw msg.error;

  return id;
}

export async function listMemories(): Promise<MemorySummary[]> {
  const { data, error } = await supabase.rpc('visible_memories');
  if (error) throw error;
  return (data ?? []) as MemorySummary[];
}

export async function getMemory(id: string): Promise<MemorySummary | null> {
  const { data, error } = await supabase.rpc('visible_memories', { p_memory_id: id }).maybeSingle();
  if (error) throw error;
  return (data as MemorySummary | null) ?? null;
}

export async function getMessages(memoryId: string): Promise<MemoryMessage[]> {
  const { data, error } = await supabase.rpc('memory_messages', { p_memory_id: memoryId });
  if (error) throw error;
  return (data ?? []) as MemoryMessage[];
}

// 追記の下書きを作る（解除したことのある人だけが作れる）
export async function createAddendum(memoryId: string, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ memory_id: memoryId, author_id: userId, is_original: false, body: '' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export type Visit = { id: string; user_id: string; unlocked_at: string; photo_path: string | null };

// 訪問の記録（訪問写真つき）。古い順
export async function listVisits(memoryId: string): Promise<Visit[]> {
  const { data, error } = await supabase
    .from('unlocks')
    .select('id, user_id, unlocked_at, photo_path')
    .eq('memory_id', memoryId)
    .order('unlocked_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Visit[];
}

export async function saveDraft(messageId: string, body: string) {
  const { error } = await supabase.from('messages').update({ body }).eq('id', messageId);
  if (error) throw error;
}

export async function sealMessage(messageId: string) {
  const { error } = await supabase.rpc('seal_message', { p_message_id: messageId });
  if (error) throw error;
}

// 思い出を消す（写真は、思い出を消してからでないと消せない決まり）
export async function deleteMemory(memory: Pick<MemorySummary, 'id' | 'photo_path'>) {
  const { error } = await supabase.from('memories').delete().eq('id', memory.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([memory.photo_path]);
}

export async function getPhotoUsage(): Promise<{ used: number; photo_limit: number } | null> {
  const { data, error } = await supabase.rpc('my_photo_usage').single();
  if (error) throw error;
  return data as { used: number; photo_limit: number } | null;
}

// エラーを利用者向けの文にする
export function errorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e);
  if (message.includes('photo limit reached')) {
    return '写真の保存上限に達しています。使わない思い出を消すと、また撮れるようになります。';
  }
  if (message.includes('cannot seal an empty message')) return 'メッセージを書いてから封をしてください。';
  if (message.includes('invalid invite')) return '招待コードが見つかりません。もう一度確かめてください。';
  if (message.includes('not allowed')) return 'この操作をする権限がありません。';
  if (message.includes('already sealed')) return 'このメッセージにはもう封がされています。';
  if (message.includes('Network request failed') || message.includes('Failed to fetch')) {
    return '通信できませんでした。電波の良いところでもう一度試してください。';
  }
  return `エラーが起きました：${message}`;
}
