-- 写真の保存場所（非公開バケット）とアクセスルール
--
-- パスの決まり
--   元の写真  : {持ち主のユーザーID}/{思い出のID}.jpg            … アプリがアップロードする
--   訪問写真  : {撮った人のユーザーID}/visits/{解除記録のID}.jpg   … 解除用の Edge Function だけが保存する

-- ============================================================
-- 思い出の写真のパスを固定する
-- ============================================================
-- 他人の写真のパスを自分の思い出に登録して、その写真を見られるようになるのを防ぐ
drop policy memories_insert on public.memories;
create policy memories_insert on public.memories for insert with check (
  owner_id = (select auth.uid())
  and photo_path = (select auth.uid())::text || '/' || id::text || '.jpg'
  and (album_id is null or album_role(album_id) in ('owner', 'editor'))
);

-- ============================================================
-- バケット
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg']);

-- ============================================================
-- 写真を見られるか
-- ============================================================
--   元の写真: その思い出が見える人
--   訪問写真: その思い出が見える人（共有メンバー全員）
create function public.can_view_photo(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memories m where m.photo_path = p_path and can_view_memory(m.id))
      or exists (select 1 from unlocks u where u.photo_path = p_path and can_view_memory(u.memory_id))
$$;

-- どの思い出・訪問からも使われていない写真か（消してよいか）
create function public.is_photo_unreferenced(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from memories where photo_path = p_path)
     and not exists (select 1 from unlocks where photo_path = p_path)
$$;

revoke execute on function public.can_view_photo(text)        from public, anon, authenticated;
revoke execute on function public.is_photo_unreferenced(text) from public, anon, authenticated;
grant execute on function public.can_view_photo(text)        to authenticated;
grant execute on function public.is_photo_unreferenced(text) to authenticated;

-- ============================================================
-- storage.objects のアクセスルール
-- ============================================================
-- 閲覧: 自分のフォルダの写真と、見えている思い出の写真・訪問写真
create policy photos_select on storage.objects for select to authenticated using (
  bucket_id = 'photos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.can_view_photo(name)
  )
);

-- アップロード: 自分のフォルダの直下だけ（visits/ は Edge Function 専用）
create policy photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
);

-- 削除: 自分のフォルダの写真で、どこからも使われていないものだけ
--   （思い出を消してから写真を消す。訪問写真は unlocks.photo_path を空にしてから消す）
create policy photos_delete on storage.objects for delete to authenticated using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.is_photo_unreferenced(name)
);
-- 上書き（update）は許可しない
