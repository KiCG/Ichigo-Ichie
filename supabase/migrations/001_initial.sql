-- users (auth.users と対応)
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  plan_type text not null default 'free' check (plan_type in ('free', 'premium', 'pro')),
  created_at timestamptz not null default now()
);

-- bookshelves
create table public.bookshelves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  title text not null,
  created_at timestamptz not null default now()
);

-- albums
create table public.albums (
  id uuid primary key default gen_random_uuid(),
  bookshelf_id uuid references public.bookshelves(id) on delete set null,
  user_id uuid references public.users(id) on delete cascade not null,
  title text not null,
  cover_photo_id uuid,
  created_at timestamptz not null default now()
);

-- photos
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid references public.albums(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  image_url text not null,
  latitude double precision not null,
  longitude double precision not null,
  taken_at timestamptz not null default now()
);

-- cover_photo_id の FK を後から追加（photos テーブル作成後）
alter table public.albums
  add constraint albums_cover_photo_id_fkey
  foreign key (cover_photo_id) references public.photos(id) on delete set null;

-- messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid references public.photos(id) on delete cascade not null,
  content text not null,
  author_id uuid references public.users(id) on delete cascade not null,
  is_original boolean not null default false,
  created_at timestamptz not null default now()
);

-- unlock_records
create table public.unlock_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  photo_id uuid references public.photos(id) on delete cascade not null,
  unlock_image_url text,
  unlocked_at timestamptz not null default now(),
  unique(user_id, photo_id)
);

-- album_shares
create table public.album_shares (
  id uuid primary key default gen_random_uuid(),
  album_id uuid references public.albums(id) on delete cascade not null,
  shared_by_user_id uuid references public.users(id) on delete cascade not null,
  shared_to_user_id uuid references public.users(id) on delete cascade,
  share_token uuid unique,
  permission text not null check (permission in ('read_only', 'can_edit')),
  shared_at timestamptz not null default now()
);

-- RLS 有効化
alter table public.users enable row level security;
alter table public.bookshelves enable row level security;
alter table public.albums enable row level security;
alter table public.photos enable row level security;
alter table public.messages enable row level security;
alter table public.unlock_records enable row level security;
alter table public.album_shares enable row level security;

-- users ポリシー
create policy "users_select_own" on public.users for select using (auth.uid() = id);
create policy "users_update_own" on public.users for update using (auth.uid() = id);

-- bookshelves ポリシー
create policy "bookshelves_all_own" on public.bookshelves for all using (auth.uid() = user_id);

-- albums ポリシー
create policy "albums_all_own" on public.albums for all using (auth.uid() = user_id);
create policy "albums_select_shared" on public.albums for select using (
  exists (
    select 1 from public.album_shares
    where album_id = albums.id and shared_to_user_id = auth.uid()
  )
);

-- photos ポリシー
create policy "photos_all_own" on public.photos for all using (auth.uid() = user_id);
create policy "photos_select_shared" on public.photos for select using (
  exists (
    select 1 from public.album_shares
    where album_id = photos.album_id and shared_to_user_id = auth.uid()
  )
);

-- messages ポリシー
create policy "messages_select_accessible" on public.messages for select using (
  exists (
    select 1 from public.photos p
    where p.id = messages.photo_id
      and (
        p.user_id = auth.uid()
        or exists (
          select 1 from public.album_shares
          where album_id = p.album_id and shared_to_user_id = auth.uid()
        )
      )
  )
);
create policy "messages_insert_own" on public.messages for insert with check (auth.uid() = author_id);

-- unlock_records ポリシー
create policy "unlock_records_all_own" on public.unlock_records for all using (auth.uid() = user_id);

-- album_shares ポリシー
create policy "album_shares_all_by_sharer" on public.album_shares for all using (auth.uid() = shared_by_user_id);
create policy "album_shares_select_shared_to" on public.album_shares for select using (auth.uid() = shared_to_user_id);

-- サインアップ時に users レコードを自動作成するトリガー
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.users (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'ユーザー'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
