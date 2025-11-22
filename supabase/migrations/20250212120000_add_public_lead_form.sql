-- Public lead/booking form support per workspace.
-- Adds a shareable token + enable flag and a lightweight submission log for abuse protection.

alter table public.workspaces
  add column if not exists public_lead_form_token uuid not null default gen_random_uuid(),
  add column if not exists public_leads_enabled boolean not null default true;

-- Ensure existing workspaces have a token.
update public.workspaces
set public_lead_form_token = coalesce(public_lead_form_token, gen_random_uuid());

create table if not exists public.lead_form_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  ip_hash text,
  user_agent text,
  blocked_reason text,
  honeypot_tripped boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists lead_form_submissions_workspace_created_idx
  on public.lead_form_submissions (workspace_id, created_at desc);

create index if not exists lead_form_submissions_ip_hash_idx
  on public.lead_form_submissions (ip_hash);

alter table public.lead_form_submissions enable row level security;

drop policy if exists "Allow workspace members to read lead form submissions" on public.lead_form_submissions;
create policy "Allow workspace members to read lead form submissions"
on public.lead_form_submissions
for select
using (public.is_workspace_member(workspace_id));

comment on table public.lead_form_submissions is
  'Denormalized log of public lead form submissions for rate limiting and spam review.';
