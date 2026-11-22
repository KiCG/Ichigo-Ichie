-- 新規登録のときに入力した表示名を、プロフィールに入れる
--   アプリは signUp の options.data.display_name で送る
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, left(coalesce(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 50));
  return new;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
