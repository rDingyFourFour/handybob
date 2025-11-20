alter table public.appointments
  add column if not exists external_event_id text;

create index if not exists appointments_external_event_id_idx
  on public.appointments (external_event_id);
