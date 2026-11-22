// アルバム・メンバー・招待の読み書き
import { supabase } from '@/lib/supabase';

export type Role = 'owner' | 'editor' | 'participant';

// my_albums() が返す1件
export type Album = {
  id: string;
  name: string;
  owner_id: string;
  my_role: Role;
  member_count: number;
  memory_count: number;
  cover_photo_path: string | null;
  created_at: string;
};

export type Member = { user_id: string; role: Role; joined_at: string; display_name: string };
export type Invite = { id: string; token: string; role: Role; created_at: string };

export async function listAlbums(): Promise<Album[]> {
  const { data, error } = await supabase.rpc('my_albums');
  if (error) throw error;
  return (data ?? []) as Album[];
}

export async function getAlbum(id: string): Promise<Album | null> {
  return (await listAlbums()).find((a) => a.id === id) ?? null;
}

export async function createAlbum(userId: string, name: string): Promise<string> {
  const { data, error } = await supabase
    .from('albums')
    .insert({ owner_id: userId, name: name.trim() })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function renameAlbum(id: string, name: string) {
  const { error } = await supabase.from('albums').update({ name: name.trim() }).eq('id', id);
  if (error) throw error;
}

// アルバムを消しても思い出は消えない（それぞれの持ち主の「未整理」に戻る）
export async function deleteAlbum(id: string) {
  const { error } = await supabase.from('albums').delete().eq('id', id);
  if (error) throw error;
}

export async function listMembers(albumId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('album_members')
    .select('user_id, role, joined_at, profiles(display_name)')
    .eq('album_id', albumId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const p = row.profiles as { display_name: string } | { display_name: string }[] | null;
    const name = Array.isArray(p) ? p[0]?.display_name : p?.display_name;
    return { user_id: row.user_id, role: row.role as Role, joined_at: row.joined_at, display_name: name ?? '' };
  });
}

// メンバーを外す（持ち主）／自分が抜ける。その人の思い出はアルバムから外れる
export async function removeMember(albumId: string, userId: string) {
  const { error } = await supabase.from('album_members').delete().eq('album_id', albumId).eq('user_id', userId);
  if (error) throw error;
}

export async function createInvite(albumId: string, userId: string): Promise<Invite> {
  const { data, error } = await supabase
    .from('album_invites')
    .insert({ album_id: albumId, created_by: userId })
    .select('id, token, role, created_at')
    .single();
  if (error) throw error;
  return data as Invite;
}

export async function listInvites(albumId: string): Promise<Invite[]> {
  const { data, error } = await supabase
    .from('album_invites')
    .select('id, token, role, created_at')
    .eq('album_id', albumId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Invite[];
}

export async function revokeInvite(id: string) {
  const { error } = await supabase.from('album_invites').update({ revoked_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function acceptInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_invite', { p_token: code });
  if (error) throw error;
  return data as string;
}

// 思い出をアルバムに入れる（思い出の持ち主が、編集できるアルバムへ）
export async function moveMemoryToAlbum(memoryId: string, albumId: string) {
  const { error } = await supabase.from('memories').update({ album_id: albumId }).eq('id', memoryId);
  if (error) throw error;
}

// 思い出をアルバムから外す（思い出の持ち主か、アルバムの持ち主）
export async function removeMemoryFromAlbum(memoryId: string) {
  const { error } = await supabase.rpc('remove_memory_from_album', { p_memory_id: memoryId });
  if (error) throw error;
}

export function inviteMessage(albumName: string, code: string) {
  return (
    `一期一会のアルバム「${albumName}」に招待します。\n` +
    `アプリの「思い出」タブで「招待コードで参加」を選び、次のコードを入力してください。\n\n` +
    `招待コード：${code}`
  );
}

export function roleLabel(role: Role) {
  return role === 'owner' ? '持ち主' : role === 'editor' ? 'メンバー' : '参加者';
}
