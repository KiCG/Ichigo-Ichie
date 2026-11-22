\set ON_ERROR_STOP on
-- test_rules.sql の続き（同じデータを使う）
\set A '''aaaaaaaa-0000-0000-0000-000000000000'''
\set B '''bbbbbbbb-0000-0000-0000-000000000000'''
\set C '''cccccccc-0000-0000-0000-000000000000'''
\set PA '''aaaaaaaa-0000-0000-0000-000000000000/11111111-0000-0000-0000-000000000000.jpg'''
\set PA2 '''aaaaaaaa-0000-0000-0000-000000000000/55555555-0000-0000-0000-000000000000.jpg'''

select ok((select public = false from storage.buckets where id = 'photos'), 'photos バケットは非公開');

set role authenticated;
select as_user(:A);
insert into storage.objects (bucket_id, name) values ('photos', :PA), ('photos', :PA2);
select throws($$insert into storage.objects (bucket_id, name) values ('photos', 'bbbbbbbb-0000-0000-0000-000000000000/12345678-0000-0000-0000-000000000000.jpg')$$,
  '他人のフォルダにはアップロードできない');
select throws($$insert into storage.objects (bucket_id, name) values ('photos', 'aaaaaaaa-0000-0000-0000-000000000000/visits/12345678-0000-0000-0000-000000000000.jpg')$$,
  '訪問写真のフォルダにはアップロードできない');
select ok((select count(*) = 2 from storage.objects), '自分の写真は見える');
delete from storage.objects where name = :PA;
reset role;
select ok((select count(*) = 1 from storage.objects where name = :PA), '使われている写真は消せない');

-- 訪問写真（Edge Function が保存する想定）
insert into storage.objects (bucket_id, name, owner)
values ('photos', 'bbbbbbbb-0000-0000-0000-000000000000/visits/b1.jpg', :B);
update unlocks set photo_path = 'bbbbbbbb-0000-0000-0000-000000000000/visits/b1.jpg' where user_id = :B;

set role authenticated;
select as_user(:B);
select ok((select count(*) = 2 from storage.objects), 'Bには共有された元の写真と自分の訪問写真が見える（下書きの写真は見えない）');
select ok((select bool_and(name <> :PA2) from storage.objects), '下書きの思い出の写真はBに見えない');

select as_user(:A);
select ok((select count(*) = 3 from storage.objects), 'Aには自分の写真2枚とBの訪問写真が見える');

select as_user(:C);
select ok((select count(*) = 0 from storage.objects), '部外者には何も見えない');

-- 未使用になった写真は消せる
select as_user(:A);
delete from memories where id = '55555555-0000-0000-0000-000000000000';
delete from storage.objects where name = :PA2;
reset role;
select ok((select count(*) = 0 from storage.objects where name = :PA2), '思い出を消した後なら写真も消せる');

set role anon;
select as_user(null);
select ok((select count(*) = 0 from storage.objects), 'ログインしていないと写真は見えない');
reset role;

-- ---------- visible_memories ----------
set role authenticated;
select as_user(:A);
select ok((select count(*) = 1 from visible_memories()), 'A: 自分の思い出が1件');
select ok((select sealed_at is not null and sealed_count = 3 and readable_count = 1 and my_unlock_count = 2
           from visible_memories('11111111-0000-0000-0000-000000000000')),
  'A: 封の状態・件数・読める数・解除回数が返る（Bの追記はロック中）');
select as_user(:B);
select ok((select count(*) = 1 and bool_and(sealed_count = 3 and readable_count = 2 and my_unlock_count = 1)
           from visible_memories()), 'B: 共有された思い出が見え、件数が返る');
select as_user(:C);
select ok((select count(*) = 1 from visible_memories()), 'C: 自分の思い出だけ見える');
select ok((select original_message_id is null and sealed_at is null from visible_memories()), 'C: メッセージのない思い出は下書き扱い');
set role anon;
select as_user(null);
select throws($$select * from visible_memories()$$, 'ログインしていないと呼べない');
reset role;

