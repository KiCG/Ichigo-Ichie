alter table public.messages
  add column if not exists unlock_record_id uuid references public.unlock_records(id) on delete set null;

-- 1つのロック解除期間につき1件のメッセージのみ許可
create unique index if not exists messages_unlock_record_id_idx
  on public.messages(unlock_record_id)
  where unlock_record_id is not null;
