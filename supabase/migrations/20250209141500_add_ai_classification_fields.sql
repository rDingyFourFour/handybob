-- AI classification fields for leads and calls.
alter table public.jobs
  add column if not exists ai_category text,
  add column if not exists ai_urgency text,
  add column if not exists ai_confidence numeric;

alter table public.calls
  add column if not exists ai_category text,
  add column if not exists ai_urgency text,
  add column if not exists ai_confidence numeric;
