-- Align calls table with Twilio voicemail workflow requirements.
alter table public.calls
  add column if not exists twilio_call_sid text,
  alter column created_at set default timezone('utc', now());

-- Keep RLS consistent (user_id scoped) — policies already enforce user_id = auth.uid().
