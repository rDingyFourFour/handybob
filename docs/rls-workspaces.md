# RLS pattern for workspaces

Workspace ownership is the primary guard. Every row that should be tenant-scoped includes:
- `workspace_id uuid references public.workspaces(id)`
- RLS policies check `public.is_workspace_member(workspace_id)` for read/write.
- `user_id` is kept for attribution (who created/sent), not for access.

Canonical policy shape (applied to jobs, customers, quotes, invoices, appointments, messages, calls, media, settings, audit_logs, etc.):
```
alter table public.<table> enable row level security;

drop policy if exists "Allow workspace members to read <table>" on public.<table>;
create policy "Allow workspace members to read <table>"
on public.<table>
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "Allow workspace members to write <table>" on public.<table>;
create policy "Allow workspace members to write <table>"
on public.<table>
for all
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
```

Quick test script (psql or Supabase SQL editor) to verify isolation:
```
-- Create two users (replace with auth.users ids)
select '[replace-with-user-a]'::uuid as user_a, '[replace-with-user-b]'::uuid as user_b \gset

-- Create two workspaces and memberships
insert into public.workspaces (id, name, owner_id) values (gen_random_uuid(), 'WS A', :'user_a');
insert into public.workspaces (id, name, owner_id) values (gen_random_uuid(), 'WS B', :'user_b');
insert into public.workspace_members (workspace_id, user_id, role) select id, owner_id, 'owner' from public.workspaces;

-- Create a job in WS A
insert into public.jobs (workspace_id, user_id, title, status) values
((select id from public.workspaces where name='WS A'), :'user_a', 'WS A job', 'lead');

-- As user B (set role with `set auth.uid()`) confirm no visibility:
select set_config('request.jwt.claim.sub', :'user_b'::text, true);
select * from public.jobs; -- should return 0 rows

-- As user A confirm visibility:
select set_config('request.jwt.claim.sub', :'user_a'::text, true);
select title from public.jobs; -- should return "WS A job"
```

Checklist for future tables:
1) Add `workspace_id uuid references public.workspaces(id)` and index.
2) Backfill from owning user’s default workspace if migrating existing rows.
3) Apply the policy template above.
4) Keep `user_id` for actor attribution only.
