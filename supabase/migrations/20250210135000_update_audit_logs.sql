-- Align audit_logs with workspace-scoped, actor-aware auditing requirements.
-- Fields: id, workspace_id, actor_user_id (nullable for system actions), action, entity_type,
-- entity_id (text for flexibility), metadata (jsonb), created_at.

-- Rename legacy columns if present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'actor_id'
  ) then
    alter table public.audit_logs rename column actor_id to actor_user_id;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'changes'
  ) then
    alter table public.audit_logs rename column changes to metadata;
  end if;
end $$;

-- Ensure columns exist.
alter table public.audit_logs
  add column if not exists actor_user_id uuid references auth.users(id),
  add column if not exists metadata jsonb;

-- Allow flexible entity ids.
alter table public.audit_logs
  alter column entity_id type text using entity_id::text;

comment on table public.audit_logs is
  'Workspace-scoped audit log. Workspace members can view entries; actor_user_id may be null for system actions.';

-- Keep policies workspace-based (members can read/insert).
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

-- Refresh audit function to use new column names/shape.
create or replace function public.log_audit_change()
returns trigger as $$
declare
  actor uuid;
  target_workspace uuid;
  row_id text;
  payload jsonb;
begin
  actor := auth.uid();

  if TG_OP = 'INSERT' then
    target_workspace := new.workspace_id;
    row_id := coalesce(new.id::text, gen_random_uuid()::text);
    payload := jsonb_build_object('new', to_jsonb(new));
    insert into public.audit_logs (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (target_workspace, actor, 'insert', TG_TABLE_NAME, row_id, payload);
    return new;
  elsif TG_OP = 'UPDATE' then
    target_workspace := coalesce(new.workspace_id, old.workspace_id);
    row_id := coalesce(new.id::text, old.id::text);
    payload := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
    insert into public.audit_logs (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (target_workspace, actor, 'update', TG_TABLE_NAME, row_id, payload);
    return new;
  elsif TG_OP = 'DELETE' then
    target_workspace := old.workspace_id;
    row_id := old.id::text;
    payload := jsonb_build_object('old', to_jsonb(old));
    insert into public.audit_logs (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (target_workspace, actor, 'delete', TG_TABLE_NAME, row_id, payload);
    return old;
  end if;

  return null;
end;
$$ language plpgsql security definer set search_path=public;
