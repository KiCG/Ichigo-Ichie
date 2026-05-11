create table if not exists public.bookshelves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

alter table public.albums
  add column if not exists bookshelf_id uuid references public.bookshelves(id) on delete set null;

alter table public.bookshelves enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'bookshelves' and policyname = 'Users can manage their own bookshelves'
  ) then
    create policy "Users can manage their own bookshelves"
      on public.bookshelves for all
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;
