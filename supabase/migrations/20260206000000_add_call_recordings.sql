-- Extend the calls table with Twilio recording metadata for later analysis.
alter table public.calls
  add column if not exists twilio_recording_sid text,
  add column if not exists twilio_recording_url text,
  add column if not exists twilio_recording_duration_seconds integer,
  add column if not exists twilio_recording_received_at timestamptz;
