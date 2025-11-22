-- Workspace setting to enable automatic confirmation emails to public lead submitters.
alter table public.workspaces
  add column if not exists auto_confirmation_email_enabled boolean not null default false;
