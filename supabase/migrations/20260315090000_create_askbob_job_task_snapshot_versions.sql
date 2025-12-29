-- append-only snapshot history for AskBob job tasks

create table if not exists public.askbob_job_task_snapshot_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  job_id uuid not null,
  task text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.askbob_job_task_snapshot_versions
  add constraint askbob_job_task_snapshot_versions_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;

alter table public.askbob_job_task_snapshot_versions
  add constraint askbob_job_task_snapshot_versions_job_id_fkey
  foreign key (job_id) references public.jobs(id) on delete cascade;

create index if not exists askbob_job_task_snapshot_versions_workspace_job_idx
  on public.askbob_job_task_snapshot_versions (workspace_id, job_id, task, created_at desc);
