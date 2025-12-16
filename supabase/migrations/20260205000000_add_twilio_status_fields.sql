-- Add Twilio call metadata to the calls table so we can store outbound statuses and errors.
alter table public.calls
  add column if not exists twilio_status text,
  add column if not exists twilio_status_updated_at timestamptz,
  add column if not exists twilio_error_code text,
  add column if not exists twilio_error_message text;

