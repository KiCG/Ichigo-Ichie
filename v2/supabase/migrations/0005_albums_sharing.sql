-- 段階3：アルバムと共有のための追加

-- ============================================================
-- 招待コードを短く、入力しやすくする（8文字。見間違えやすい 0/O/1/I/L は使わない）
-- ============================================================
create function public.gen_invite_code()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  code text := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return code;
end $$;

alter table public.album_invites alter column token set default public.gen_invite_code();

-- 招待コードで参加する（大文字・小文字や前後の空白は気にしない）。参加したアルバムの ID を返す
create or replace function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_invite album_invites;
begin
  select * into v_invite from album_invites
  where token = upper(btrim(p_token)) and revoked_at is null;
  if not found then
    raise exception 'invalid invite';
  end if;
  insert into album_members (album_id, user_id, role)
  values (v_invite.album_id, auth.uid(), v_invite.role)
  on conflict (album_id, user_id) do nothing;
  return v_invite.album_id;
end $$;

-- ============================================================
-- アルバムから思い出を外す（思い出の持ち主か、アルバムの持ち主ができる）
-- 外した思い出は、撮った人の「未整理」に戻る
-- ============================================================
create function public.remove_memory_from_album(p_memory_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update memories m set album_id = null
  where m.id = p_memory_id
    and m.album_id is not null
    and (m.owner_id = auth.uid() or album_role(m.album_id) = 'owner');
  if not found then
    raise exception 'not allowed';
  end if;
end $$;

-- ============================================================
-- メンバーが抜けた・外されたら、その人の思い出をアルバムから外す
-- （その人の「未整理」に戻る。他のメンバーからは見えなくなる）
-- ============================================================
create function public.album_members_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update memories set album_id = null
  where album_id = old.album_id and owner_id = old.user_id;
  return old;
end $$;

create trigger album_members_after_delete
after delete on public.album_members
for each row execute function public.album_members_after_delete();

-- ============================================================
-- 自分のアルバムの一覧（思い出タブ用）
-- ============================================================
create function public.my_albums()
returns table (
  id uuid,
  name text,
  owner_id uuid,
  my_role text,
  member_count integer,
  memory_count integer,      -- 自分に見えている思い出の数
  cover_photo_path text,     -- 自分に見えている、いちばん新しい思い出の写真
  created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select
    a.id, a.name, a.owner_id, me.role,
    (select count(*)::int from album_members x where x.album_id = a.id),
    coalesce(v.cnt, 0),
    v.cover,
    a.created_at
  from albums a
  join album_members me on me.album_id = a.id and me.user_id = auth.uid()
  left join lateral (
    select count(*)::int as cnt,
           (array_agg(m.photo_path order by m.taken_at desc))[1] as cover
    from memories m
    where m.album_id = a.id and can_view_memory(m.id)
  ) v on true
  order by a.created_at desc
$$;

-- ============================================================
-- 実行権限
-- ============================================================
revoke execute on function public.gen_invite_code() from public, anon, authenticated;
revoke execute on function public.album_members_after_delete() from public, anon, authenticated;
revoke execute on function public.remove_memory_from_album(uuid) from public, anon, authenticated;
revoke execute on function public.my_albums() from public, anon, authenticated;
grant execute on function public.remove_memory_from_album(uuid) to authenticated;
grant execute on function public.my_albums() to authenticated;
-- accept_invite は作り直したので権限を付け直す
revoke execute on function public.accept_invite(text) from public, anon, authenticated;
grant execute on function public.accept_invite(text) to authenticated;
-- gen_invite_code は招待の作成時（authenticated の INSERT）の既定値として呼ばれる
grant execute on function public.gen_invite_code() to authenticated;
