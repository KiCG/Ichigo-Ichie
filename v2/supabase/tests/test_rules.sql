\set ON_ERROR_STOP on
-- 検証用の補助関数
create function public.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok: %', label;
end $$;
create function public.throws(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'ok: % (%)', label, sqlerrm; return; end;
  raise exception 'FAIL (no error): %', label;
end $$;
create function public.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false); end $$;
-- 東京時間で「今日から day 日後の hour 時」
create function public.tokyo(day int, hour int) returns timestamptz language sql as $$
  select (((now() at time zone 'Asia/Tokyo')::date + day) + make_interval(hours => hour)) at time zone 'Asia/Tokyo'
$$;
-- 封をした日時を過去にずらす（検証用。トリガーを一時的に止める）
create function public.backdate(p_id uuid, p_at timestamptz) returns void language plpgsql as $$
begin
  alter table public.messages disable trigger messages_guard;
  update public.messages set sealed_at = p_at where id = p_id;
  alter table public.messages enable trigger messages_guard;
end $$;
grant execute on function public.ok(boolean, text), public.throws(text, text), public.as_user(uuid) to authenticated, anon;

-- 利用者: A（持ち主）, B（友人）, C（部外者）
insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000000'),
  ('bbbbbbbb-0000-0000-0000-000000000000'),
  ('cccccccc-0000-0000-0000-000000000000');
\set A '''aaaaaaaa-0000-0000-0000-000000000000'''
\set B '''bbbbbbbb-0000-0000-0000-000000000000'''
\set C '''cccccccc-0000-0000-0000-000000000000'''

set role authenticated;

-- ---------- 1人で使う ----------
select as_user(:A);
insert into memories (id, owner_id, photo_path, latitude, longitude, taken_at)
values ('11111111-0000-0000-0000-000000000000', :A, 'aaaaaaaa-0000-0000-0000-000000000000/11111111-0000-0000-0000-000000000000.jpg', 35.0, 135.0, now());
insert into messages (id, memory_id, author_id, is_original, body)
values ('22222222-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000', :A, true, '春の京都');
select ok((select count(*) = 1 from messages), '下書きは自分で読める');
update messages set body = '春の京都、桜が満開' where id = '22222222-0000-0000-0000-000000000000';
select ok((select body = '春の京都、桜が満開' from messages), '下書きは書き直せる');

select throws($$update messages set sealed_at = '2000-01-01' where id = '22222222-0000-0000-0000-000000000000'$$,
  '封をした日時を直接書き込めない');
select throws($$insert into messages (memory_id, author_id, body, sealed_at) values ('11111111-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'x', '2000-01-01')$$,
  '封をした状態で作成できない');
select seal_message('22222222-0000-0000-0000-000000000000');
reset role;
select backdate('22222222-0000-0000-0000-000000000000', tokyo(-3, 10));  -- 3日前の10時に封をしたことにする
set role authenticated;
select as_user(:A);
reset role;
select ok((select sealed_at > '2020-01-01' from messages where id = '22222222-0000-0000-0000-000000000000'),
  '封をした日時は利用者が指定できない');
set role authenticated;
select as_user(:A);

select ok((select count(*) = 0 from messages), '封をした後は自分でも読めない');
select ok((select body is null and not is_readable from memory_messages('11111111-0000-0000-0000-000000000000')),
  'memory_messages はロック中の本文を返さない');
update messages set body = 'x' where id = '22222222-0000-0000-0000-000000000000';
reset role;
select ok((select body = '春の京都、桜が満開' from messages where id = '22222222-0000-0000-0000-000000000000'),
  '封をした後は書き換えられない（更新が 0 行になる）');
select throws($$update messages set body = 'x' where id = '22222222-0000-0000-0000-000000000000'$$,
  '封をした後は管理者でも書き換えられない（トリガー）');
set role authenticated;
select as_user(:A);

-- 解除は利用者が直接記録できない
select throws($$insert into unlocks (memory_id, user_id) values ('11111111-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000')$$,
  '解除の記録は利用者が作れない');

-- 当日（3日前の15時）の解除（Edge Function の代わりに管理者として記録）
reset role;
insert into unlocks (memory_id, user_id, unlocked_at)
values ('11111111-0000-0000-0000-000000000000', :A, tokyo(-3, 15));
set role authenticated;
select as_user(:A);
select ok((select not is_readable from memory_messages('11111111-0000-0000-0000-000000000000')),
  '封をした当日の解除では読めない');

-- 翌日（2日前の9時）の解除
reset role;
insert into unlocks (memory_id, user_id, unlocked_at)
values ('11111111-0000-0000-0000-000000000000', :A, tokyo(-2, 9));
set role authenticated;
select as_user(:A);
select ok((select is_readable and body = '春の京都、桜が満開' from memory_messages('11111111-0000-0000-0000-000000000000')),
  '翌日以降の解除で読める');

-- 自分の追記も、次の訪問まで読めない
insert into messages (id, memory_id, author_id, body)
values ('33333333-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000', :A, '秋にまた来た');
select seal_message('33333333-0000-0000-0000-000000000000');
reset role;
select backdate('33333333-0000-0000-0000-000000000000', tokyo(-1, 12));  -- 昨日の12時に封をしたことにする
set role authenticated;
select as_user(:A);
select ok((select not is_readable from memory_messages('11111111-0000-0000-0000-000000000000')
           where id = '33333333-0000-0000-0000-000000000000'), '自分の追記もロックされる');
select ok((select is_readable from memory_messages('11111111-0000-0000-0000-000000000000')
           where is_original), '元のメッセージは読めるまま');

select throws($$insert into messages (memory_id, author_id, is_original, body) values ('11111111-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', true, 'two')$$,
  '元のメッセージは1つだけ');
insert into messages (id, memory_id, author_id, body)
values ('66666666-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000', :A, '  ');
select throws($$select seal_message('66666666-0000-0000-0000-000000000000')$$, '空のメッセージには封ができない');
delete from messages where id = '66666666-0000-0000-0000-000000000000';
select throws($$select seal_message('33333333-0000-0000-0000-000000000000')$$, '二度は封ができない');

-- ---------- 共有 ----------
insert into albums (id, owner_id, name) values ('44444444-0000-0000-0000-000000000000', :A, '京都');
insert into album_invites (album_id, token, created_by) values ('44444444-0000-0000-0000-000000000000', 'tok', :A);

-- 下書きのままの思い出も同じアルバムに入れておく
insert into memories (id, owner_id, album_id, photo_path, latitude, longitude, taken_at)
values ('55555555-0000-0000-0000-000000000000', :A, '44444444-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000/55555555-0000-0000-0000-000000000000.jpg', 35.0, 135.0, now());
insert into messages (memory_id, author_id, is_original, body)
values ('55555555-0000-0000-0000-000000000000', :A, true, 'まだ下書き');
update memories set album_id = '44444444-0000-0000-0000-000000000000' where id = '11111111-0000-0000-0000-000000000000';

select as_user(:C);
select ok((select count(*) = 0 from memories), '部外者には何も見えない');

select as_user(:B);
select ok((select count(*) = 0 from memories), '招待前のBには見えない');
select accept_invite('tok');
select ok((select album_role('44444444-0000-0000-0000-000000000000') = 'editor'), '招待で編集者になる');
select ok((select count(*) = 1 from memories), '封をした思い出だけ見える（下書きの思い出は見えない）');
select ok((select count(*) = 2 from memory_messages('11111111-0000-0000-0000-000000000000')),
  '封をしたメッセージはロック中として件数が見える');
select ok((select bool_and(not is_readable) from memory_messages('11111111-0000-0000-0000-000000000000')),
  'Bは解除するまで読めない');
select ok((select count(*) = 2 from unlocks), '訪問の記録（訪問写真）はメンバーに見える');
select throws($$insert into messages (memory_id, author_id, body) values ('11111111-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'まだ行ってない')$$,
  '解除していないと追記できない');
update memories set album_id = null where id = '11111111-0000-0000-0000-000000000000';
select ok((select count(*) = 1 from memories), '他人の思い出はアルバムから外せない');

-- Bが今日解除し、訪問写真を保存
reset role;
insert into unlocks (memory_id, user_id, unlocked_at, photo_path)
values ('11111111-0000-0000-0000-000000000000', :B, now(), 'bbbbbbbb-0000-0000-0000-000000000000/visits/b1.jpg');
set role authenticated;
select as_user(:B);
select ok((select count(*) = 2 and bool_and(is_readable) from memory_messages('11111111-0000-0000-0000-000000000000')),
  'Bは今日の解除で、昨日までに封をされた元のメッセージとAの追記を読める');
insert into messages (id, memory_id, author_id, body)
values ('77777777-0000-0000-0000-000000000000', '11111111-0000-0000-0000-000000000000', :B, 'Bの追記');
select as_user(:A);
select ok((select count(*) = 2 from memory_messages('11111111-0000-0000-0000-000000000000')),
  'Bの下書きはAには存在も見えない');
select as_user(:B);
select seal_message('77777777-0000-0000-0000-000000000000');
select as_user(:A);
select ok((select count(*) = 3 and count(*) filter (where is_readable) = 1
           from memory_messages('11111111-0000-0000-0000-000000000000')),
  '封をしたBの追記は、Aにはロック中として見える');
select as_user(:B);
select ok((select used = 1 from my_photo_usage()), '訪問写真は撮った人の枚数に数える');
update unlocks set photo_path = null where user_id = :B;
select ok((select used = 0 from my_photo_usage()), '訪問写真を消すと枠が空く');
select throws($$update unlocks set photo_path = 'other.jpg' where user_id = 'bbbbbbbb-0000-0000-0000-000000000000'$$,
  '訪問写真のパスを書き換えることはできない');

-- アルバムから外すと、解除済みのBも読めなくなる。戻すとまた読める
select as_user(:A);
update memories set album_id = null where id = '11111111-0000-0000-0000-000000000000';
select as_user(:B);
select ok((select count(*) = 0 from memories), '外すとBには見えない');
select ok((select count(*) = 0 from memory_messages('11111111-0000-0000-0000-000000000000')), '外すとBは読めない');
select as_user(:A);
update memories set album_id = '44444444-0000-0000-0000-000000000000' where id = '11111111-0000-0000-0000-000000000000';
select as_user(:B);
select ok((select count(*) filter (where is_readable) = 2 from memory_messages('11111111-0000-0000-0000-000000000000')),
  '戻すとBはまた読める（自分の追記はまだロック）');

-- 写真の上限
select as_user(:C);
reset role;
update profiles set photo_limit = 1 where id = :C;
set role authenticated;
select as_user(:C);
select throws($$update profiles set photo_limit = 999 where id = 'cccccccc-0000-0000-0000-000000000000'$$,
  '上限は利用者が変えられない');
select throws($$insert into memories (id, owner_id, photo_path, latitude, longitude, taken_at) values ('c0000001-0000-0000-0000-000000000000', 'cccccccc-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000/11111111-0000-0000-0000-000000000000.jpg', 0, 0, now())$$,
  '他人の写真のパスは登録できない');
insert into memories (id, owner_id, photo_path, latitude, longitude, taken_at)
values ('c0000001-0000-0000-0000-000000000000', :C, 'cccccccc-0000-0000-0000-000000000000/c0000001-0000-0000-0000-000000000000.jpg', 0, 0, now());
select throws($$insert into memories (id, owner_id, photo_path, latitude, longitude, taken_at) values ('c0000002-0000-0000-0000-000000000000', 'cccccccc-0000-0000-0000-000000000000', 'cccccccc-0000-0000-0000-000000000000/c0000002-0000-0000-0000-000000000000.jpg', 0, 0, now())$$,
  '上限を超えると追加できない');

select ok((select used = 1 and photo_limit = 1 from my_photo_usage()), '自分の枚数と上限は確認できる');
select throws($$select photo_count('aaaaaaaa-0000-0000-0000-000000000000')$$, '他人の写真枚数は調べられない');
select throws($$select is_memory_published('11111111-0000-0000-0000-000000000000')$$, '内部用の関数は直接呼べない');

-- ログインしていない人
reset role;
set role anon;
select as_user(null);
select throws($$select memory_messages('11111111-0000-0000-0000-000000000000')$$, 'ログインしていないと関数を呼べない');
select throws($$select accept_invite('tok')$$, 'ログインしていないと招待を受けられない');

reset role;
