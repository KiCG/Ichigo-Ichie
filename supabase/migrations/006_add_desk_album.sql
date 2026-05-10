-- albums テーブルに is_desk カラムを追加
alter table public.albums add column if not exists is_desk boolean not null default false;

-- 既存ユーザーの机アルバムを作成
insert into public.albums (user_id, title, is_desk)
select u.id, '机', true
from public.users u
where not exists (
  select 1 from public.albums a where a.user_id = u.id and a.is_desk = true
);

-- 新規ユーザーのサインアップ時に机アルバムを自動作成
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.users (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'ユーザー'));

  insert into public.albums (user_id, title, is_desk)
  values (new.id, '机', true);

  return new;
end;
$$;
