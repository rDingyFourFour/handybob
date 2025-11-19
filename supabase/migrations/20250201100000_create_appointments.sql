create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  title text not null,
  notes text,
  start_time timestamptz not null,
  end_time timestamptz,
  status text not null default 'scheduled',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists appointments_user_id_idx
  on public.appointments (user_id);

create index if not exists appointments_start_time_idx
  on public.appointments (start_time);

alter table public.appointments enable row level security;

drop policy if exists "Allow select own appointments" on public.appointments;
create policy "Allow select own appointments"
on public.appointments
for select
using (user_id = auth.uid());

drop policy if exists "Allow insert own appointments" on public.appointments;
create policy "Allow insert own appointments"
on public.appointments
for insert
with check (user_id = auth.uid());

drop policy if exists "Allow update own appointments" on public.appointments;
create policy "Allow update own appointments"
on public.appointments
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Allow delete own appointments" on public.appointments;
create policy "Allow delete own appointments"
on public.appointments
for delete
using (user_id = auth.uid());
