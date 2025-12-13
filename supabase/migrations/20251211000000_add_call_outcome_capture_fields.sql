-- Add explicit outcome capture attributes for call sessions.
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS reached_customer boolean,
  ADD COLUMN IF NOT EXISTS outcome_code text,
  ADD COLUMN IF NOT EXISTS outcome_notes text,
  ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_recorded_by uuid references auth.users(id) on delete set null;

ALTER TABLE public.calls
  ADD CONSTRAINT calls_outcome_code_check
  CHECK (
    outcome_code IS NULL OR outcome_code IN (
      'reached_scheduled',
      'reached_needs_followup',
      'reached_declined',
      'no_answer_left_voicemail',
      'no_answer_no_voicemail',
      'wrong_number',
      'other'
    )
  );
