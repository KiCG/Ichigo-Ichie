-- アルバムを作った直後に、作った本人がそのアルバムを読めるようにする
--   持ち主のメンバー登録はトリガーで行うため、作成時の読み返し（insert ... returning）の
--   時点ではまだメンバーになっていない。持ち主は常に読めるようにする
drop policy albums_select on public.albums;
create policy albums_select on public.albums for select using (
  owner_id = (select auth.uid()) or album_role(id) is not null
);
