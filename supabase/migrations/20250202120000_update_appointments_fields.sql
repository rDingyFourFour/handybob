do $$
begin
  if not exists (select 1 from pg_type where typname = 'appointment_status') then
    create type public.appointment_status as enum ('scheduled', 'completed', 'cancelled');
  end if;
end $$;

alter table public.appointments
  add column if not exists location text,
  add column if not exists notes text,
  add column if not exists start_time timestamptz,
  add column if not exists end_time timestamptz,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

-- Ensure status uses the enum
alter table public.appointments
  alter column status drop default;

alter table public.appointments
  alter column status type public.appointment_status using (status::public.appointment_status);

alter table public.appointments
  alter column status set default 'scheduled';

update public.appointments
set status = 'scheduled'
where status is null;

-- RLS safety: ensure user-scoped policies exist
alter table public.appointments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'Allow select own appointments'
      and tablename = 'appointments'
  ) then
    create policy "Allow select own appointments"
    on public.appointments
    for select
    using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'Allow insert own appointments'
      and tablename = 'appointments'
  ) then
    create policy "Allow insert own appointments"
    on public.appointments
    for insert
    with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'Allow update own appointments'
      and tablename = 'appointments'
  ) then
    create policy "Allow update own appointments"
    on public.appointments
    for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'Allow delete own appointments'
      and tablename = 'appointments'
  ) then
    create policy "Allow delete own appointments"
    on public.appointments
    for delete
    using (user_id = auth.uid());
  end if;
end $$;
