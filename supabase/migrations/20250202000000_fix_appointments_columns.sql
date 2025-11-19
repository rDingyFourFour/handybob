alter table public.appointments
  add column if not exists title text,
  add column if not exists start_time timestamptz,
  add column if not exists end_time timestamptz,
  add column if not exists notes text,
  add column if not exists status text not null default 'scheduled';

update public.appointments
set status = 'scheduled'
where status is null;
