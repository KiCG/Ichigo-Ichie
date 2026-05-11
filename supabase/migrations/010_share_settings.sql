-- album_shares に共有設定フラグを追加
alter table public.album_shares
  add column if not exists can_message boolean not null default false,
  add column if not exists can_add_photos boolean not null default false;

-- can_message = true の共有では、参加者全員の unlock_records を閲覧できるようにする
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'unlock_records' and policyname = 'unlock_records_select_shared'
  ) then
    create policy "unlock_records_select_shared"
      on public.unlock_records for select
      using (
        exists (
          select 1 from public.photos p
          join public.album_shares s on s.album_id = p.album_id
          where p.id = unlock_records.photo_id
            and s.can_message = true
            and (s.shared_by_user_id = auth.uid() or s.shared_to_user_id = auth.uid())
        )
      );
  end if;
end $$;
