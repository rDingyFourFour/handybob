-- Ensure calls has job linkage before creating the index (previous migration may have lacked column).
alter table public.calls
  add column if not exists job_id uuid references public.jobs(id) on delete set null;

create index if not exists calls_job_id_idx on public.calls (job_id);
