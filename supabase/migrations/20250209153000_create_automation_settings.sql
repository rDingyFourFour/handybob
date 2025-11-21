-- Automation settings for notifications and future flags.
create table if not exists public.automation_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_new_urgent_lead boolean not null default false,
  sms_new_urgent_lead boolean not null default false,
  sms_alert_number text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.touch_automation_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql security definer set search_path=public;

drop trigger if exists set_automation_settings_updated_at on public.automation_settings;
create trigger set_automation_settings_updated_at
before update on public.automation_settings
for each row
execute function public.touch_automation_settings_updated_at();

alter table public.automation_settings enable row level security;

drop policy if exists "Allow select own automation settings" on public.automation_settings;
create policy "Allow select own automation settings"
on public.automation_settings
for select
using (user_id = auth.uid());

drop policy if exists "Allow insert own automation settings" on public.automation_settings;
create policy "Allow insert own automation settings"
on public.automation_settings
for insert
with check (user_id = auth.uid());

drop policy if exists "Allow update own automation settings" on public.automation_settings;
create policy "Allow update own automation settings"
on public.automation_settings
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
