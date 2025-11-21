-- Align workspaces schema with requested fields (primary_contact_user_id) and document single-workspace assumption for now.

alter table public.workspaces
  add column if not exists primary_contact_user_id uuid references auth.users(id) on delete set null;

-- Backfill primary_contact_user_id from existing owner_id for single-user installs.
update public.workspaces
set primary_contact_user_id = owner_id
where primary_contact_user_id is null;

comment on table public.workspaces is
  'Represents a HandyBob account/business. Long-term a user may belong to multiple workspaces; current UI assumes one workspace per user.';

comment on table public.workspace_members is
  'Join table linking users to workspaces with roles (owner, staff). Long-term supports multi-workspace memberships.';
