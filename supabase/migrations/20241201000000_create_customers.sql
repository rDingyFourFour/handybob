create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  email text,
  phone text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists customers_user_id_idx on public.customers (user_id);

alter table public.customers enable row level security;

drop policy if exists "Allow select own customers" on public.customers;
create policy "Allow select own customers"
on public.customers
for select
using (user_id = auth.uid());

drop policy if exists "Allow insert own customers" on public.customers;
create policy "Allow insert own customers"
on public.customers
for insert
with check (user_id = auth.uid());

drop policy if exists "Allow update own customers" on public.customers;
create policy "Allow update own customers"
on public.customers
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Allow delete own customers" on public.customers;
create policy "Allow delete own customers"
on public.customers
for delete
using (user_id = auth.uid());
