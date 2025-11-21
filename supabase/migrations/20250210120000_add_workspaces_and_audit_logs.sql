-- Adds workspaces + membership with roles, moves settings to workspace scope,
-- and records important changes via audit_logs triggers.

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'workspace_role'
  ) then
    create type public.workspace_role as enum ('owner', 'staff');
  end if;
end;
$$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Workspace',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.touch_workspaces_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql security definer set search_path=public;

drop trigger if exists set_workspaces_updated_at on public.workspaces;
create trigger set_workspaces_updated_at
before update on public.workspaces
for each row
execute function public.touch_workspaces_updated_at();

create unique index if not exists workspaces_owner_id_unique on public.workspaces (owner_id);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'staff',
  created_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_id_idx on public.workspace_members (user_id);

create or replace function public.add_owner_membership()
returns trigger as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path=public;

drop trigger if exists create_owner_membership on public.workspaces;
create trigger create_owner_membership
after insert on public.workspaces
for each row
execute function public.add_owner_membership();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
security definer
set search_path=public
stable
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.default_workspace_id()
returns uuid
language sql
security definer
set search_path=public
stable
as $$
  select workspace_id
  from public.workspace_members
  where user_id = auth.uid()
  order by case when role = 'owner' then 0 else 1 end, created_at
  limit 1;
$$;

drop policy if exists "Allow members to read workspaces" on public.workspaces;
create policy "Allow members to read workspaces"
on public.workspaces
for select
using (public.is_workspace_member(id));

drop policy if exists "Allow owners to update workspaces" on public.workspaces;
create policy "Allow owners to update workspaces"
on public.workspaces
for update
using (exists (
  select 1 from public.workspace_members wm
  where wm.workspace_id = workspaces.id and wm.user_id = auth.uid() and wm.role = 'owner'
));

drop policy if exists "Allow owners to insert workspaces" on public.workspaces;
create policy "Allow owners to insert workspaces"
on public.workspaces
for insert
with check (owner_id = auth.uid());

drop policy if exists "Allow members to read workspace members" on public.workspace_members;
create policy "Allow members to read workspace members"
on public.workspace_members
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "Allow owners to manage workspace members" on public.workspace_members;
create policy "Allow owners to manage workspace members"
on public.workspace_members
for all
using (exists (
  select 1 from public.workspaces w
  where w.id = workspace_members.workspace_id and w.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.workspaces w
  where w.id = workspace_members.workspace_id and w.owner_id = auth.uid()
));

-- Seed a workspace for every existing user and ensure owner membership.
insert into public.workspaces (owner_id, name)
select id, coalesce(raw_user_meta_data->>'company', 'Workspace')
from auth.users
on conflict (owner_id) do nothing;

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.owner_id, 'owner'
from public.workspaces w
on conflict (workspace_id, user_id) do nothing;

-- Customers
alter table public.customers
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade default public.default_workspace_id();

update public.customers c
set workspace_id = w.id
from public.workspaces w
where c.workspace_id is null
  and c.user_id = w.owner_id;

alter table public.customers alter column workspace_id set not null;
create index if not exists customers_workspace_id_idx on public.customers (workspace_id);

drop policy if exists "Allow select own customers" on public.customers;
drop policy if exists "Allow insert own customers" on public.customers;
drop policy if exists "Allow update own customers" on public.customers;
drop policy if exists "Allow delete own customers" on public.customers;

create policy "Allow workspace members to read customers"
on public.customers
for select
using (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to insert customers"
on public.customers
for insert
with check (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to update customers"
on public.customers
for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to delete customers"
on public.customers
for delete
using (public.is_workspace_member(workspace_id));

-- Jobs
alter table public.jobs
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade default public.default_workspace_id();

update public.jobs j
set workspace_id = w.id
from public.workspaces w
where j.workspace_id is null
  and j.user_id = w.owner_id;

alter table public.jobs alter column workspace_id set not null;
create index if not exists jobs_workspace_id_idx on public.jobs (workspace_id);

drop policy if exists "Allow select own jobs" on public.jobs;
drop policy if exists "Allow insert own jobs" on public.jobs;
drop policy if exists "Allow update own jobs" on public.jobs;
drop policy if exists "Allow delete own jobs" on public.jobs;

create policy "Allow workspace members to read jobs"
on public.jobs
for select
using (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to insert jobs"
on public.jobs
for insert
with check (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to update jobs"
on public.jobs
for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to delete jobs"
on public.jobs
for delete
using (public.is_workspace_member(workspace_id));

-- Appointments
alter table public.appointments
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade default public.default_workspace_id();

update public.appointments a
set workspace_id = j.workspace_id
from public.jobs j
where a.workspace_id is null
  and a.job_id = j.id;

update public.appointments a
set workspace_id = w.id
from public.workspaces w
where a.workspace_id is null
  and a.user_id = w.owner_id;

alter table public.appointments alter column workspace_id set not null;
create index if not exists appointments_workspace_id_idx on public.appointments (workspace_id);

drop policy if exists "Allow select own appointments" on public.appointments;
drop policy if exists "Allow insert own appointments" on public.appointments;
drop policy if exists "Allow update own appointments" on public.appointments;
drop policy if exists "Allow delete own appointments" on public.appointments;

create policy "Allow workspace members to read appointments"
on public.appointments
for select
using (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to insert appointments"
on public.appointments
for insert
with check (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to update appointments"
on public.appointments
for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to delete appointments"
on public.appointments
for delete
using (public.is_workspace_member(workspace_id));

-- Quotes
alter table public.quotes
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade default public.default_workspace_id();

update public.quotes q
set workspace_id = j.workspace_id
from public.jobs j
where q.workspace_id is null
  and q.job_id = j.id;

update public.quotes q
set workspace_id = w.id
from public.workspaces w
where q.workspace_id is null
  and q.user_id = w.owner_id;

alter table public.quotes alter column workspace_id set not null;
create index if not exists quotes_workspace_id_idx on public.quotes (workspace_id);

drop policy if exists "Allow select own quotes" on public.quotes;
drop policy if exists "Allow insert own quotes" on public.quotes;
drop policy if exists "Allow update own quotes" on public.quotes;

create policy "Allow workspace members to read quotes"
on public.quotes
for select
using (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to insert quotes"
on public.quotes
for insert
with check (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to update quotes"
on public.quotes
for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

-- Quote payments
alter table public.quote_payments
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade default public.default_workspace_id();

update public.quote_payments qp
set workspace_id = q.workspace_id
from public.quotes q
where qp.workspace_id is null
  and qp.quote_id = q.id;

update public.quote_payments qp
set workspace_id = w.id
from public.workspaces w
where qp.workspace_id is null
  and qp.user_id = w.owner_id;

alter table public.quote_payments alter column workspace_id set not null;
create index if not exists quote_payments_workspace_id_idx on public.quote_payments (workspace_id);

drop policy if exists "Allow select own quote payments" on public.quote_payments;
create policy "Allow workspace members to read quote payments"
on public.quote_payments
for select
using (public.is_workspace_member(workspace_id));

-- Invoices
alter table public.invoices
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade default public.default_workspace_id();

update public.invoices i
set workspace_id = q.workspace_id
from public.quotes q
where i.workspace_id is null
  and i.quote_id = q.id;

update public.invoices i
set workspace_id = w.id
from public.workspaces w
where i.workspace_id is null
  and i.user_id = w.owner_id;

alter table public.invoices alter column workspace_id set not null;
create index if not exists invoices_workspace_id_idx on public.invoices (workspace_id);

drop policy if exists "Allow select own invoices" on public.invoices;
drop policy if exists "Allow insert own invoices" on public.invoices;
drop policy if exists "Allow update own invoices" on public.invoices;

create policy "Allow workspace members to read invoices"
on public.invoices
for select
using (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to insert invoices"
on public.invoices
for insert
with check (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to update invoices"
on public.invoices
for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

-- Messages
alter table public.messages
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade default public.default_workspace_id();

update public.messages m
set workspace_id = j.workspace_id
from public.jobs j
where m.workspace_id is null
  and m.job_id = j.id;

update public.messages m
set workspace_id = q.workspace_id
from public.quotes q
where m.workspace_id is null
  and m.quote_id = q.id;

update public.messages m
set workspace_id = i.workspace_id
from public.invoices i
where m.workspace_id is null
  and m.invoice_id = i.id;

update public.messages m
set workspace_id = w.id
from public.workspaces w
where m.workspace_id is null
  and m.user_id = w.owner_id;

alter table public.messages alter column workspace_id set not null;
create index if not exists messages_workspace_id_idx on public.messages (workspace_id);

drop policy if exists "Allow select own messages" on public.messages;
drop policy if exists "Allow insert own messages" on public.messages;
drop policy if exists "Allow update own messages" on public.messages;
drop policy if exists "Allow delete own messages" on public.messages;

create policy "Allow workspace members to read messages"
on public.messages
for select
using (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to insert messages"
on public.messages
for insert
with check (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to update messages"
on public.messages
for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to delete messages"
on public.messages
for delete
using (public.is_workspace_member(workspace_id));

-- Calls
alter table public.calls
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade default public.default_workspace_id();

update public.calls c
set workspace_id = j.workspace_id
from public.jobs j
where c.workspace_id is null
  and c.job_id = j.id;

update public.calls c
set workspace_id = w.id
from public.workspaces w
where c.workspace_id is null
  and c.user_id = w.owner_id;

alter table public.calls alter column workspace_id set not null;
create index if not exists calls_workspace_id_idx on public.calls (workspace_id);

drop policy if exists "Allow select own calls" on public.calls;
drop policy if exists "Allow insert own calls" on public.calls;
drop policy if exists "Allow update own calls" on public.calls;
drop policy if exists "Allow delete own calls" on public.calls;

create policy "Allow workspace members to read calls"
on public.calls
for select
using (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to insert calls"
on public.calls
for insert
with check (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to update calls"
on public.calls
for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to delete calls"
on public.calls
for delete
using (public.is_workspace_member(workspace_id));

-- Media
alter table public.media
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade default public.default_workspace_id();

update public.media m
set workspace_id = j.workspace_id
from public.jobs j
where m.workspace_id is null
  and m.job_id = j.id;

update public.media m
set workspace_id = w.id
from public.workspaces w
where m.workspace_id is null
  and m.user_id = w.owner_id;

alter table public.media alter column workspace_id set not null;
create index if not exists media_workspace_id_idx on public.media (workspace_id);

drop policy if exists "Allow select own media" on public.media;
drop policy if exists "Allow insert own media" on public.media;
drop policy if exists "Allow update own media" on public.media;
drop policy if exists "Allow delete own media" on public.media;

create policy "Allow workspace members to read media"
on public.media
for select
using (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to insert media"
on public.media
for insert
with check (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to update media"
on public.media
for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to delete media"
on public.media
for delete
using (public.is_workspace_member(workspace_id));

-- Automation preferences (workspace scoped)
alter table public.automation_preferences
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

update public.automation_preferences ap
set workspace_id = w.id
from public.workspaces w
where ap.workspace_id is null
  and ap.user_id = w.owner_id;

alter table public.automation_preferences alter column workspace_id set not null;

-- Drop old policies that depend on user_id before removing the column.
drop policy if exists "Allow select own automation preferences" on public.automation_preferences;
drop policy if exists "Allow insert own automation preferences" on public.automation_preferences;
drop policy if exists "Allow update own automation preferences" on public.automation_preferences;

do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public' and table_name = 'automation_preferences' and column_name = 'user_id'
  ) then
    alter table public.automation_preferences drop constraint if exists automation_preferences_pkey;
  end if;
end $$;

alter table public.automation_preferences
  drop column if exists user_id;

alter table public.automation_preferences
  add constraint automation_preferences_pkey primary key (workspace_id);

create index if not exists automation_preferences_workspace_id_idx on public.automation_preferences (workspace_id);

create policy "Allow workspace members to read automation preferences"
on public.automation_preferences
for select
using (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to upsert automation preferences"
on public.automation_preferences
for all
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

-- Automation settings (workspace scoped)
alter table public.automation_settings
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

update public.automation_settings ap
set workspace_id = w.id
from public.workspaces w
where ap.workspace_id is null
  and ap.user_id = w.owner_id;

alter table public.automation_settings alter column workspace_id set not null;

-- Drop old policies that depend on user_id before removing the column.
drop policy if exists "Allow select own automation settings" on public.automation_settings;
drop policy if exists "Allow insert own automation settings" on public.automation_settings;
drop policy if exists "Allow update own automation settings" on public.automation_settings;

do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public' and table_name = 'automation_settings' and column_name = 'user_id'
  ) then
    alter table public.automation_settings drop constraint if exists automation_settings_pkey;
  end if;
end $$;

alter table public.automation_settings
  drop column if exists user_id;

alter table public.automation_settings
  add constraint automation_settings_pkey primary key (workspace_id);

create index if not exists automation_settings_workspace_id_idx on public.automation_settings (workspace_id);

create policy "Allow workspace members to read automation settings"
on public.automation_settings
for select
using (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to upsert automation settings"
on public.automation_settings
for all
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

-- Automation events
alter table public.automation_events
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade default public.default_workspace_id();

update public.automation_events ae
set workspace_id = j.workspace_id
from public.jobs j
where ae.workspace_id is null
  and ae.job_id = j.id;

update public.automation_events ae
set workspace_id = c.workspace_id
from public.calls c
where ae.workspace_id is null
  and ae.call_id = c.id;

update public.automation_events ae
set workspace_id = w.id
from public.workspaces w
where ae.workspace_id is null
  and ae.user_id = w.owner_id;

alter table public.automation_events alter column workspace_id set not null;
create index if not exists automation_events_workspace_id_idx on public.automation_events (workspace_id, created_at desc);

drop policy if exists "Allow select own automation events" on public.automation_events;
drop policy if exists "Allow insert own automation events" on public.automation_events;

create policy "Allow workspace members to read automation events"
on public.automation_events
for select
using (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to insert automation events"
on public.automation_events
for insert
with check (public.is_workspace_member(workspace_id));

-- Pricing settings (workspace scoped)
create table if not exists public.pricing_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  hourly_rate numeric not null default 125,
  minimum_job_fee numeric,
  travel_fee numeric,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Legacy table used user_id + id; migrate it to workspace_id shape.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pricing_settings' and column_name = 'workspace_id'
  ) then
    alter table public.pricing_settings
      add column workspace_id uuid,
      add column if not exists minimum_job_fee numeric,
      add column if not exists travel_fee numeric,
      add column if not exists created_at timestamptz not null default timezone('utc', now()),
      add column if not exists updated_at timestamptz not null default timezone('utc', now());
  end if;
end;
$$;

update public.pricing_settings ps
set workspace_id = w.id
from public.workspaces w
where ps.workspace_id is null
  and ps.user_id is not null
  and w.owner_id = ps.user_id;

alter table public.pricing_settings
  alter column workspace_id set default public.default_workspace_id();

alter table public.pricing_settings
  alter column workspace_id set not null;

-- Remove legacy policy that depended on user_id before dropping the column.
drop policy if exists pricing_settings_owner_all on public.pricing_settings;

do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'pricing_settings' and constraint_name = 'pricing_settings_user_id_fkey'
  ) then
    alter table public.pricing_settings drop constraint pricing_settings_user_id_fkey;
  end if;
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'pricing_settings' and constraint_name = 'pricing_settings_pkey'
  ) then
    alter table public.pricing_settings drop constraint pricing_settings_pkey;
  end if;
end;
$$;

drop index if exists pricing_settings_user_id_key;

alter table public.pricing_settings
  drop column if exists id,
  drop column if exists user_id;

alter table public.pricing_settings
  add constraint pricing_settings_pkey primary key (workspace_id);

create unique index if not exists pricing_settings_workspace_id_idx on public.pricing_settings (workspace_id);

create or replace function public.touch_pricing_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql security definer set search_path=public;

drop trigger if exists set_pricing_settings_updated_at on public.pricing_settings;
create trigger set_pricing_settings_updated_at
before update on public.pricing_settings
for each row
execute function public.touch_pricing_settings_updated_at();

alter table public.pricing_settings enable row level security;

drop policy if exists pricing_settings_owner_all on public.pricing_settings;
drop policy if exists "Allow workspace members to read pricing settings" on public.pricing_settings;
drop policy if exists "Allow workspace members to upsert pricing settings" on public.pricing_settings;

create policy "Allow workspace members to read pricing settings"
on public.pricing_settings
for select
using (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to upsert pricing settings"
on public.pricing_settings
for all
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

-- Audit logging
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  changes jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_logs_workspace_id_created_at_idx
  on public.audit_logs (workspace_id, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "Allow workspace members to read audit logs" on public.audit_logs;
drop policy if exists "Allow workspace members to insert audit logs" on public.audit_logs;

create policy "Allow workspace members to read audit logs"
on public.audit_logs
for select
using (public.is_workspace_member(workspace_id));

create policy "Allow workspace members to insert audit logs"
on public.audit_logs
for insert
with check (public.is_workspace_member(workspace_id));

create or replace function public.log_audit_change()
returns trigger as $$
declare
  actor uuid;
  target_workspace uuid;
  row_id uuid;
  payload jsonb;
begin
  actor := auth.uid();

  if TG_OP = 'INSERT' then
    target_workspace := new.workspace_id;
    row_id := coalesce(new.id, gen_random_uuid());
    payload := jsonb_build_object('new', to_jsonb(new));
    insert into public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
    values (target_workspace, actor, 'insert', TG_TABLE_NAME, row_id, payload);
    return new;
  elsif TG_OP = 'UPDATE' then
    target_workspace := coalesce(new.workspace_id, old.workspace_id);
    row_id := coalesce(new.id, old.id);
    payload := jsonb_build_object(
      'old', to_jsonb(old),
      'new', to_jsonb(new)
    );
    insert into public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
    values (target_workspace, actor, 'update', TG_TABLE_NAME, row_id, payload);
    return new;
  elsif TG_OP = 'DELETE' then
    target_workspace := old.workspace_id;
    row_id := old.id;
    payload := jsonb_build_object('old', to_jsonb(old));
    insert into public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, changes)
    values (target_workspace, actor, 'delete', TG_TABLE_NAME, row_id, payload);
    return old;
  end if;

  return null;
end;
$$ language plpgsql security definer set search_path=public;

drop trigger if exists log_jobs_audit on public.jobs;
create trigger log_jobs_audit
after insert or update on public.jobs
for each row
execute function public.log_audit_change();

drop trigger if exists log_quotes_audit on public.quotes;
create trigger log_quotes_audit
after insert or update on public.quotes
for each row
execute function public.log_audit_change();

drop trigger if exists log_invoices_audit on public.invoices;
create trigger log_invoices_audit
after insert or update on public.invoices
for each row
execute function public.log_audit_change();

drop trigger if exists log_automation_settings_audit on public.automation_settings;
create trigger log_automation_settings_audit
after insert or update on public.automation_settings
for each row
execute function public.log_audit_change();

drop trigger if exists log_pricing_settings_audit on public.pricing_settings;
create trigger log_pricing_settings_audit
after insert or update on public.pricing_settings
for each row
execute function public.log_audit_change();
