create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  title text,
  description_raw text,
  category text,
  urgency text,
  status text not null default 'lead',
  source text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists jobs_user_id_idx on public.jobs (user_id);
create index if not exists jobs_customer_id_idx on public.jobs (customer_id);

alter table public.jobs enable row level security;

drop policy if exists "Allow select own jobs" on public.jobs;
create policy "Allow select own jobs"
on public.jobs
for select
using (user_id = auth.uid());

drop policy if exists "Allow insert own jobs" on public.jobs;
create policy "Allow insert own jobs"
on public.jobs
for insert
with check (user_id = auth.uid());

drop policy if exists "Allow update own jobs" on public.jobs;
create policy "Allow update own jobs"
on public.jobs
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Allow delete own jobs" on public.jobs;
create policy "Allow delete own jobs"
on public.jobs
for delete
using (user_id = auth.uid());
