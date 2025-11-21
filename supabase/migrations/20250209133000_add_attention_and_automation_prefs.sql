-- Add prioritization signals for jobs and calls plus per-user automation preferences.
alter table public.jobs
  add column if not exists priority text not null default 'normal',
  add column if not exists attention_score integer not null default 0,
  add column if not exists attention_reason text;

alter table public.calls
  add column if not exists priority text not null default 'normal',
  add column if not exists attention_score integer not null default 0,
  add column if not exists attention_reason text,
  add column if not exists needs_followup boolean not null default false;

create table if not exists public.automation_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notify_urgent_leads boolean not null default true,
  show_overdue_work boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.touch_automation_preferences_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql security definer set search_path=public;

drop trigger if exists set_automation_preferences_updated_at on public.automation_preferences;
create trigger set_automation_preferences_updated_at
before update on public.automation_preferences
for each row
execute function public.touch_automation_preferences_updated_at();

alter table public.automation_preferences enable row level security;

drop policy if exists "Allow select own automation preferences" on public.automation_preferences;
create policy "Allow select own automation preferences"
on public.automation_preferences
for select
using (user_id = auth.uid());

drop policy if exists "Allow insert own automation preferences" on public.automation_preferences;
create policy "Allow insert own automation preferences"
on public.automation_preferences
for insert
with check (user_id = auth.uid());

drop policy if exists "Allow update own automation preferences" on public.automation_preferences;
create policy "Allow update own automation preferences"
on public.automation_preferences
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
