\set ON_ERROR_STOP on
-- test_storage.sql の続き（アルバム 4444 は A が持ち主、B が編集者）
\set A '''aaaaaaaa-0000-0000-0000-000000000000'''
\set B '''bbbbbbbb-0000-0000-0000-000000000000'''
\set C '''cccccccc-0000-0000-0000-000000000000'''
\set ALBUM '''44444444-0000-0000-0000-000000000000'''

-- ---------- 招待コード ----------
set role authenticated;
select as_user(:A);
insert into album_invites (album_id, created_by) values (:ALBUM, :A);
reset role;
select token as code from album_invites where token <> 'TOK' order by created_at desc limit 1 \gset
select ok(:'code' ~ '^[A-HJKMNP-Z2-9]{8}$', '招待コードは見間違えにくい8文字');

set role authenticated;
select as_user(:C);
select ok((select accept_invite('  ' || lower(:'code') || ' ')) = :ALBUM, '小文字や空白が混じっていても参加できる');
select ok((select album_role(:ALBUM) = 'editor'), 'C は編集者として参加した');
select throws($$select accept_invite('XXXXXXXX')$$, '存在しないコードでは参加できない');

-- 取り消した招待では参加できない
select as_user(:A);
update album_invites set revoked_at = now() where token = :'code';
reset role;
delete from album_members where album_id = :ALBUM and user_id = :C;
set role authenticated;
select as_user(:C);
select throws(format('select accept_invite(%L)', :'code'), '取り消した招待では参加できない');

-- ---------- アルバムの持ち主による整理 ----------
-- B がアルバムに思い出を追加して封をする
select as_user(:B);
insert into memories (id, owner_id, album_id, photo_path, latitude, longitude, taken_at)
values ('b0000001-0000-0000-0000-000000000000', :B, :ALBUM,
        'bbbbbbbb-0000-0000-0000-000000000000/b0000001-0000-0000-0000-000000000000.jpg', 35, 135, now());
insert into messages (id, memory_id, author_id, is_original, body)
values ('b0000002-0000-0000-0000-000000000000', 'b0000001-0000-0000-0000-000000000000', :B, true, 'Bの思い出');
select seal_message('b0000002-0000-0000-0000-000000000000');

select as_user(:A);
select ok((select count(*) = 1 from visible_memories() where id = 'b0000001-0000-0000-0000-000000000000'),
  'A に B の思い出が見える');
select ok((select memory_count = 2 and member_count = 2 and my_role = 'owner' and cover_photo_path is not null
           from my_albums() where id = :ALBUM), 'my_albums: 件数・人数・役割・表紙が返る');

-- B は A の思い出を外せない
select as_user(:B);
select throws($$select remove_memory_from_album('11111111-0000-0000-0000-000000000000')$$,
  '編集者は他人の思い出をアルバムから外せない');

-- A（アルバムの持ち主）は B の思い出を外せる
select as_user(:A);
select remove_memory_from_album('b0000001-0000-0000-0000-000000000000');
select ok((select count(*) = 0 from visible_memories() where id = 'b0000001-0000-0000-0000-000000000000'),
  '持ち主が外した思い出は A から見えなくなる');
select as_user(:B);
select ok((select album_id is null from visible_memories() where id = 'b0000001-0000-0000-0000-000000000000'),
  '外された思い出は B の未整理に戻る');

-- ---------- 抜けると、その人の思い出はアルバムから外れる ----------
update memories set album_id = :ALBUM where id = 'b0000001-0000-0000-0000-000000000000';
select as_user(:A);
select ok((select count(*) = 1 from visible_memories() where id = 'b0000001-0000-0000-0000-000000000000'),
  'B が戻した思い出は再び A に見える');
select as_user(:B);
delete from album_members where album_id = :ALBUM and user_id = :B;
select ok((select album_id is null from visible_memories() where id = 'b0000001-0000-0000-0000-000000000000'),
  '抜けると、自分の思い出は未整理に戻る');
select ok((select count(*) = 0 from my_albums()), '抜けたアルバムは一覧に出ない');
select as_user(:A);
select ok((select member_count = 1 from my_albums() where id = :ALBUM), 'A のアルバムは1人に戻る');
delete from album_members where album_id = :ALBUM and user_id = :A;
select ok((select my_role = 'owner' from my_albums() where id = :ALBUM), '持ち主はアルバムから抜けられない（0行削除）');

set role anon;
select as_user(null);
select throws($$select * from my_albums()$$, 'ログインしていないと my_albums は呼べない');
reset role;
\echo ALL TESTS PASSED
