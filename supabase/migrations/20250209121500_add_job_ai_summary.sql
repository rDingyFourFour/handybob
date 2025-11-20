-- Add AI summary storage for jobs created from voicemail/AI helpers.
alter table public.jobs
  add column if not exists description_ai_summary text;
