-- share_token にデフォルト値を設定（アプリ側でUUIDを生成しなくて済む）
alter table public.album_shares
  alter column share_token set default gen_random_uuid();

-- 受信者が共有アルバムの写真を閲覧できるようにする
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'photos' and policyname = 'photos_select_shared'
  ) then
    create policy "photos_select_shared" on public.photos for select using (
      exists (
        select 1 from public.album_shares
        where album_id = photos.album_id and shared_to_user_id = auth.uid()
      )
    );
  end if;
end $$;

-- 受信者が自分の共有レコードを削除できるようにする（共有を外す）
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'album_shares' and policyname = 'album_shares_delete_recipient'
  ) then
    create policy "album_shares_delete_recipient" on public.album_shares
      for delete using (auth.uid() = shared_to_user_id);
  end if;
end $$;

-- メッセージの更新を可能にする（自分が書いたメッセージのみ）
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'messages' and policyname = 'messages_update_own'
  ) then
    create policy "messages_update_own" on public.messages
      for update using (auth.uid() = author_id);
  end if;
end $$;

-- 共有コードで共有を受け取る関数（RLS を回避するため SECURITY DEFINER）
create or replace function public.accept_album_share(p_token uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  v_rows int;
begin
  update public.album_shares
  set shared_to_user_id = auth.uid()
  where share_token = p_token
    and shared_to_user_id is null
    and shared_by_user_id != auth.uid();
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;
