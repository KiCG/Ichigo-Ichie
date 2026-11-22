-- 見えている思い出の一覧（一覧画面・マップ用）
--   封をしたメッセージは本人にもテーブルから見えないため、封の状態や件数はこの関数でまとめて返す
--   p_memory_id を渡すと、その1件だけ返す
create function public.visible_memories(p_memory_id uuid default null)
returns table (
  id uuid,
  owner_id uuid,
  album_id uuid,
  photo_path text,
  latitude double precision,
  longitude double precision,
  taken_at timestamptz,
  created_at timestamptz,
  original_message_id uuid,   -- 元のメッセージ（自分の下書きなら編集に使う）
  sealed_at timestamptz,      -- 元のメッセージに封をした日時（null = 下書き）
  sealed_count integer,       -- 封をしたメッセージの数（元のメッセージ + 追記）
  readable_count integer,     -- そのうち自分が読める数
  my_unlock_count integer,    -- 自分が解除した回数
  last_unlocked_at timestamptz
) language sql stable security definer set search_path = public as $$
  select
    m.id, m.owner_id, m.album_id, m.photo_path, m.latitude, m.longitude, m.taken_at, m.created_at,
    o.id, o.sealed_at,
    coalesce(s.sealed_count, 0), coalesce(s.readable_count, 0),
    coalesce(u.cnt, 0), u.last_at
  from memories m
  left join messages o on o.memory_id = m.id and o.is_original
  left join lateral (
    select count(*)::int as sealed_count,
           count(*) filter (where can_read_sealed(m.id, msg.sealed_at))::int as readable_count
    from messages msg
    where msg.memory_id = m.id and msg.sealed_at is not null
  ) s on true
  left join lateral (
    select count(*)::int as cnt, max(unlocked_at) as last_at
    from unlocks where memory_id = m.id and user_id = auth.uid()
  ) u on true
  where (p_memory_id is null or m.id = p_memory_id)
    and can_view_memory(m.id)
  order by m.taken_at desc
$$;

revoke execute on function public.visible_memories(uuid) from public, anon, authenticated;
grant execute on function public.visible_memories(uuid) to authenticated;
