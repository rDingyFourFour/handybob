-- Log automation executions (e.g., urgent lead alerts).
create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  job_id uuid references public.jobs(id) on delete set null,
  call_id uuid references public.calls(id) on delete set null,
  channel text not null,
  status text not null,
  message text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists automation_events_user_id_idx on public.automation_events (user_id, created_at desc);

alter table public.automation_events enable row level security;

drop policy if exists "Allow select own automation events" on public.automation_events;
create policy "Allow select own automation events"
on public.automation_events
for select
using (user_id = auth.uid());

drop policy if exists "Allow insert own automation events" on public.automation_events;
create policy "Allow insert own automation events"
on public.automation_events
for insert
with check (user_id = auth.uid());
