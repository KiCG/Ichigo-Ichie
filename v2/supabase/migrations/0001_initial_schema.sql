-- 一期一会 v2 スキーマ（下書き）
-- 設計方針: docs/redesign.md / 解説: docs/data-model.md
--
-- 方針
--   * ロックの判定はすべて DB 側（RLS と関数）で行う
--   * 封をした日時（sealed_at）と解除の記録（unlocks）は、利用者が直接書き換えられない

-- ============================================================
-- テーブル
-- ============================================================

-- 利用者のプロフィール（auth.users と 1 対 1）
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  -- 「翌日以降に読める」の日付の区切りに使う
  timezone     text not null default 'Asia/Tokyo',
  -- 写真の保存上限（今持っている枚数で数える）。プランが決まるまでの仮の値
  photo_limit  integer not null default 30,
  created_at   timestamptz not null default now()
);

-- アルバム（1 階層。共有の単位）
create table public.albums (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);

-- アルバムのメンバー。持ち主も 'owner' として 1 行持つ
create table public.album_members (
  album_id  uuid not null references public.albums (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null check (role in ('owner', 'editor', 'participant')),
  joined_at timestamptz not null default now(),
  primary key (album_id, user_id)
);

-- 招待リンク
create table public.album_invites (
  id         uuid primary key default gen_random_uuid(),
  album_id   uuid not null references public.albums (id) on delete cascade,
  token      text not null unique default encode(gen_random_bytes(16), 'hex'),
  role       text not null default 'editor' check (role in ('editor', 'participant')),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- 思い出（写真 1 枚と、その場所）
create table public.memories (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  -- null = 未整理
  album_id   uuid references public.albums (id) on delete set null,
  photo_path text not null,          -- Storage 上のパス（非公開バケット）
  latitude   double precision not null check (latitude between -90 and 90),
  longitude  double precision not null check (longitude between -180 and 180),
  taken_at   timestamptz not null,
  created_at timestamptz not null default now()
);
create index on public.memories (owner_id);
create index on public.memories (album_id);

-- メッセージ（元のメッセージと追記）
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  memory_id   uuid not null references public.memories (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  is_original boolean not null default false,
  body        text not null default '',
  -- null = 下書き。値は DB が now() で入れる（利用者は指定できない）
  sealed_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.messages (memory_id);
-- 元のメッセージは思い出ごとに 1 つ
create unique index messages_one_original on public.messages (memory_id) where is_original;

-- 解除の記録（訪問）。訪問写真は任意
create table public.unlocks (
  id          uuid primary key default gen_random_uuid(),
  memory_id   uuid not null references public.memories (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  photo_path  text,                  -- 訪問写真を保存した場合のみ
  created_at  timestamptz not null default now()
);
create index on public.unlocks (memory_id, user_id, unlocked_at);

-- 外部キーの索引
create index on public.albums (owner_id);
create index on public.album_members (user_id);
create index on public.album_invites (album_id);
create index on public.album_invites (created_by);
create index on public.messages (author_id);
create index on public.unlocks (user_id);

-- ============================================================
-- 判定用の関数（RLS から呼ぶ。security definer で RLS の再帰を避ける）
-- ============================================================

-- アルバムでの自分の役割（メンバーでなければ null）
create function public.album_role(p_album_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from album_members where album_id = p_album_id and user_id = auth.uid()
$$;

-- 元のメッセージに封がされているか（共有メンバーに見えるようになる条件）
create function public.is_memory_published(p_memory_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from messages
    where memory_id = p_memory_id and is_original and sealed_at is not null
  )
$$;

-- 思い出（写真・場所・訪問写真）が見えるか
--   持ち主は常に見える
--   他の人は「今その思い出が入っている共有アルバムのメンバー」かつ「元のメッセージに封がされている」とき
create function public.can_view_memory(p_memory_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memories m
    where m.id = p_memory_id
      and (
        m.owner_id = auth.uid()
        or (
          m.album_id is not null
          and exists (select 1 from album_members am
                      where am.album_id = m.album_id and am.user_id = auth.uid())
          and is_memory_published(m.id)
        )
      )
  )
$$;

-- 封をしたメッセージの本文が読めるか
--   思い出が見えること、かつ「封をした日の翌日以降」に自分が解除していること
--   日付の区切りは読む人のタイムゾーン
create function public.can_read_sealed(p_memory_id uuid, p_sealed_at timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select can_view_memory(p_memory_id)
     and exists (
       select 1
       from unlocks u
       join profiles p on p.id = u.user_id
       where u.memory_id = p_memory_id
         and u.user_id = auth.uid()
         and (u.unlocked_at at time zone p.timezone)::date
           > (p_sealed_at at time zone p.timezone)::date
     )
$$;

-- 今持っている写真の枚数（思い出の写真 + 保存した訪問写真）
create function public.photo_count(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select (select count(*) from memories where owner_id = p_user_id)::int
       + (select count(*) from unlocks where user_id = p_user_id and photo_path is not null)::int
$$;

-- ============================================================
-- トリガー
-- ============================================================

-- メッセージ: 封をした日時は DB が決める。封をした後は変更できない
create function public.messages_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- 作成時は必ず下書き。封は seal_message() で行う
    if new.sealed_at is not null then
      raise exception 'use seal_message() to seal';
    end if;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE
  if old.sealed_at is not null then
    raise exception 'sealed message cannot be modified';
  end if;
  if new.memory_id <> old.memory_id or new.author_id <> old.author_id
     or new.is_original <> old.is_original then
    raise exception 'memory_id, author_id and is_original cannot be changed';
  end if;
  if new.sealed_at is not null then
    if char_length(btrim(new.body)) = 0 then
      raise exception 'cannot seal an empty message';
    end if;
    new.sealed_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger messages_guard
before insert or update on public.messages
for each row execute function public.messages_guard();

-- 写真の保存上限（思い出の追加時）
create function public.memories_quota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if photo_count(new.owner_id) >= (select photo_limit from profiles where id = new.owner_id) then
    raise exception 'photo limit reached';
  end if;
  return new;
end $$;

create trigger memories_quota
before insert on public.memories
for each row execute function public.memories_quota();

-- 写真の保存上限（訪問写真の保存時）
create function public.unlocks_quota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.photo_path is not null
     and (tg_op = 'INSERT' or old.photo_path is null)
     and photo_count(new.user_id) >= (select photo_limit from profiles where id = new.user_id) then
    raise exception 'photo limit reached';
  end if;
  return new;
end $$;

create trigger unlocks_quota
before insert or update on public.unlocks
for each row execute function public.unlocks_quota();

-- アルバム作成時、持ち主をメンバーに加える
create function public.albums_add_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into album_members (album_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;

create trigger albums_add_owner
after insert on public.albums
for each row execute function public.albums_add_owner();

-- 新規登録時にプロフィールを作る
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- 操作用の関数（利用者がアプリから呼ぶ）
-- ============================================================

-- 招待リンクでアルバムに参加する
create function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_invite album_invites;
begin
  select * into v_invite from album_invites where token = p_token and revoked_at is null;
  if not found then
    raise exception 'invalid invite';
  end if;
  insert into album_members (album_id, user_id, role)
  values (v_invite.album_id, auth.uid(), v_invite.role)
  on conflict (album_id, user_id) do nothing;
  return v_invite.album_id;
end $$;

-- 封をする。封をした日時は now()
--   （封をした行は本人にもテーブルから見えなくなるため、通常の UPDATE ではなくこの関数で行う）
create function public.seal_message(p_message_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_sealed_at timestamptz;
begin
  update messages set sealed_at = now()
  where id = p_message_id and author_id = auth.uid() and sealed_at is null
  returning sealed_at into v_sealed_at;
  if v_sealed_at is null then
    raise exception 'message not found or already sealed';
  end if;
  return v_sealed_at;
end $$;

-- 自分の写真の枚数と上限（アプリの表示用）
create function public.my_photo_usage()
returns table (used integer, photo_limit integer)
language sql stable security definer set search_path = public as $$
  select photo_count(auth.uid()), p.photo_limit from profiles p where p.id = auth.uid()
$$;

-- 思い出のメッセージ一覧。ロック中のものは本文を返さない
--   （行の存在と封をした日時は見えるので「ロック中のメッセージが n 件」を表示できる）
create function public.memory_messages(p_memory_id uuid)
returns table (
  id uuid, author_id uuid, is_original boolean,
  sealed_at timestamptz, is_readable boolean, body text
) language sql stable security definer set search_path = public as $$
  select
    msg.id, msg.author_id, msg.is_original, msg.sealed_at,
    r.readable,
    case when r.readable then msg.body end
  from messages msg
  cross join lateral (
    select case
      when msg.sealed_at is null then msg.author_id = auth.uid()
      else can_read_sealed(msg.memory_id, msg.sealed_at)
    end as readable
  ) r
  where msg.memory_id = p_memory_id
    and can_view_memory(p_memory_id)
    -- 他人の下書きは存在も見せない
    and (msg.sealed_at is not null or msg.author_id = auth.uid())
  order by msg.created_at
$$;

-- ============================================================
-- RLS
-- ============================================================

alter table public.profiles      enable row level security;
alter table public.albums        enable row level security;
alter table public.album_members enable row level security;
alter table public.album_invites enable row level security;
alter table public.memories      enable row level security;
alter table public.messages      enable row level security;
alter table public.unlocks       enable row level security;

-- profiles: 自分と、同じアルバムのメンバーの表示名が見える
create policy profiles_select on public.profiles for select using (
  id = (select auth.uid())
  or exists (
    select 1 from album_members a join album_members b on a.album_id = b.album_id
    where a.user_id = (select auth.uid()) and b.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- photo_limit は利用者が変えられないようにする
revoke update on public.profiles from authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;

-- albums
create policy albums_select on public.albums for select using (album_role(id) is not null);
create policy albums_insert on public.albums for insert with check (owner_id = (select auth.uid()));
create policy albums_update on public.albums for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy albums_delete on public.albums for delete using (owner_id = (select auth.uid()));

-- album_members: メンバー同士は見える。持ち主は他の人を外せる。自分は抜けられる（持ち主以外）
create policy album_members_select on public.album_members for select
  using (album_role(album_id) is not null);
create policy album_members_delete on public.album_members for delete using (
  role <> 'owner'
  and (user_id = (select auth.uid()) or album_role(album_id) = 'owner')
);
-- 追加は accept_invite 経由のみ（insert ポリシーなし）

-- album_invites: 持ち主だけが作成・確認・取り消し
create policy album_invites_select on public.album_invites for select
  using (album_role(album_id) = 'owner');
create policy album_invites_insert on public.album_invites for insert
  with check (album_role(album_id) = 'owner' and created_by = (select auth.uid()));
create policy album_invites_update on public.album_invites for update
  using (album_role(album_id) = 'owner');

-- memories
create policy memories_select on public.memories for select using (can_view_memory(id));
create policy memories_insert on public.memories for insert with check (
  owner_id = (select auth.uid())
  and (album_id is null or album_role(album_id) in ('owner', 'editor'))
);
-- 持ち主だけが、未整理・アルバムへの出し入れを行える
create policy memories_update on public.memories for update
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (album_id is null or album_role(album_id) in ('owner', 'editor'))
  );
create policy memories_delete on public.memories for delete using (owner_id = (select auth.uid()));
-- 写真・場所・撮影日時は後から変えられない
revoke update on public.memories from authenticated;
grant update (album_id) on public.memories to authenticated;

-- messages: テーブルを直接読めるのは自分が書いたものだけ。
--           他人のメッセージは memory_messages() 経由で読む（本文はロック判定つき）
create policy messages_select on public.messages for select using (
  author_id = (select auth.uid())
  and (sealed_at is null or can_read_sealed(memory_id, sealed_at))
);
create policy messages_insert on public.messages for insert with check (
  author_id = (select auth.uid())
  and (
    -- 元のメッセージ: 思い出の持ち主だけ
    (is_original and exists (select 1 from memories where id = memory_id and owner_id = (select auth.uid())))
    or
    -- 追記: 思い出が見えて、一度でも解除している人
    (not is_original
      and can_view_memory(memory_id)
      and exists (select 1 from unlocks where memory_id = messages.memory_id and user_id = (select auth.uid())))
  )
);
create policy messages_update on public.messages for update
  using (author_id = (select auth.uid()) and sealed_at is null)
  with check (author_id = (select auth.uid()));
create policy messages_delete on public.messages for delete
  using (author_id = (select auth.uid()) and sealed_at is null);
revoke update on public.messages from authenticated;
grant update (body) on public.messages to authenticated;

-- unlocks: 思い出が見える人は訪問の記録（訪問写真）を見られる。
--          作成は解除用の Edge Function（service role）だけが行う
create policy unlocks_select on public.unlocks for select using (can_view_memory(memory_id));
-- 訪問写真を後から消すことはできる（枠を空けるため）
create policy unlocks_update on public.unlocks for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and photo_path is null);
revoke update on public.unlocks from authenticated;
grant update (photo_path) on public.unlocks to authenticated;

-- ============================================================
-- 関数の実行権限
-- ============================================================
-- Supabase は新しい関数を anon / authenticated から呼べるようにするため、いったんすべて外す
revoke execute on all functions in schema public from public, anon, authenticated;

-- アプリから呼ぶ関数（ログインしている人だけ）
grant execute on function public.accept_invite(text)          to authenticated;
grant execute on function public.seal_message(uuid)           to authenticated;
grant execute on function public.memory_messages(uuid)        to authenticated;
grant execute on function public.my_photo_usage()             to authenticated;

-- アクセスルール（RLS）の中で使う関数。ルールは呼び出した人の権限で評価されるため必要
grant execute on function public.album_role(uuid)                        to authenticated;
grant execute on function public.can_view_memory(uuid)                   to authenticated;
grant execute on function public.can_read_sealed(uuid, timestamptz)      to authenticated;

-- is_memory_published / photo_count / トリガー用の関数は、他の関数の中からだけ使う（直接は呼べない）
