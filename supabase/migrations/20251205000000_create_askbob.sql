-- create askbob_sessions and askbob_responses tables

create table if not exists public.askbob_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  prompt text not null,
  job_id uuid null,
  customer_id uuid null,
  quote_id uuid null,
  created_at timestamptz not null default now()
);

alter table public.askbob_sessions
  add constraint askbob_sessions_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;

alter table public.askbob_sessions
  add constraint askbob_sessions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.askbob_sessions
  add constraint askbob_sessions_job_id_fkey
  foreign key (job_id) references public.jobs(id) on delete set null;

alter table public.askbob_sessions
  add constraint askbob_sessions_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete set null;

alter table public.askbob_sessions
  add constraint askbob_sessions_quote_id_fkey
  foreign key (quote_id) references public.quotes(id) on delete set null;

create index if not exists askbob_sessions_workspace_id_idx
  on public.askbob_sessions (workspace_id);

create index if not exists askbob_sessions_user_id_idx
  on public.askbob_sessions (user_id);

create table if not exists public.askbob_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  steps text[] not null default '{}',
  materials jsonb null,
  safety_cautions text[] null,
  cost_time_considerations text[] null,
  escalation_guidance text[] null,
  raw_model_output jsonb null,
  created_at timestamptz not null default now()
);

alter table public.askbob_responses
  add constraint askbob_responses_session_id_fkey
  foreign key (session_id) references public.askbob_sessions(id) on delete cascade;

create index if not exists askbob_responses_session_id_idx
  on public.askbob_responses (session_id);
