create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  channel text not null default 'email', -- email, sms, note
  direction text not null default 'outbound', -- inbound, outbound
  subject text,
  body text,
  status text not null default 'sent',
  external_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists messages_user_id_idx on public.messages (user_id);
create index if not exists messages_customer_id_idx on public.messages (customer_id);
create index if not exists messages_job_id_idx on public.messages (job_id);
create index if not exists messages_created_at_idx on public.messages (created_at desc);

alter table public.messages enable row level security;

drop policy if exists "Allow select own messages" on public.messages;
create policy "Allow select own messages"
on public.messages
for select
using (user_id = auth.uid());

drop policy if exists "Allow insert own messages" on public.messages;
create policy "Allow insert own messages"
on public.messages
for insert
with check (user_id = auth.uid());

drop policy if exists "Allow update own messages" on public.messages;
create policy "Allow update own messages"
on public.messages
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Allow delete own messages" on public.messages;
create policy "Allow delete own messages"
on public.messages
for delete
using (user_id = auth.uid());

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  direction text not null default 'outbound', -- inbound, outbound
  status text not null default 'completed', -- completed, missed, voicemail
  started_at timestamptz not null default timezone('utc', now()),
  duration_seconds integer default 0,
  summary text,
  recording_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Backfill job_id on calls if the table predated this migration.
alter table public.calls
  add column if not exists job_id uuid references public.jobs(id) on delete set null;
alter table public.calls
  add column if not exists started_at timestamptz not null default timezone('utc', now());

create index if not exists calls_user_id_idx on public.calls (user_id);
create index if not exists calls_customer_id_idx on public.calls (customer_id);
create index if not exists calls_job_id_idx on public.calls (job_id);
create index if not exists calls_started_at_idx on public.calls (started_at desc);

alter table public.calls enable row level security;

drop policy if exists "Allow select own calls" on public.calls;
create policy "Allow select own calls"
on public.calls
for select
using (user_id = auth.uid());

drop policy if exists "Allow insert own calls" on public.calls;
create policy "Allow insert own calls"
on public.calls
for insert
with check (user_id = auth.uid());

drop policy if exists "Allow update own calls" on public.calls;
create policy "Allow update own calls"
on public.calls
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Allow delete own calls" on public.calls;
create policy "Allow delete own calls"
on public.calls
for delete
using (user_id = auth.uid());
