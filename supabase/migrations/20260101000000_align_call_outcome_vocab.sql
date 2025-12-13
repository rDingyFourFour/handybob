-- Align call outcome constraints with the canonical vocabulary.
ALTER TABLE public.calls
  DROP CONSTRAINT IF EXISTS calls_outcome_check;

ALTER TABLE public.calls
  ADD CONSTRAINT calls_outcome_check
  CHECK (
    outcome IS NULL OR outcome IN (
      'reached',
      'voicemail',
      'no_answer',
      'wrong_number',
      'other',
      'connected_scheduled',
      'connected_not_ready',
      'left_voicemail'
    )
  );

ALTER TABLE public.calls
  DROP CONSTRAINT IF EXISTS calls_outcome_code_check;

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
