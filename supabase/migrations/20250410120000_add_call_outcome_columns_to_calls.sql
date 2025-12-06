ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS outcome text;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS outcome_notes text;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz;

ALTER TABLE public.calls
  ADD CONSTRAINT calls_outcome_check
  CHECK (
    outcome IN (
      'no_answer',
      'left_voicemail',
      'connected_scheduled',
      'connected_not_ready',
      'wrong_number',
      'other'
    )
  );