export const CALL_OUTCOME_VALUES = [
  "reached",
  "voicemail",
  "no_answer",
  "wrong_number",
  "other",
] as const;

export type CallOutcome = (typeof CALL_OUTCOME_VALUES)[number];

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  reached: "Reached customer",
  voicemail: "Left voicemail",
  no_answer: "No answer",
  wrong_number: "Wrong number",
  other: "Other outcome",
};

export const CALL_OUTCOME_OPTIONS: Array<{ value: CallOutcome; label: string }> =
  CALL_OUTCOME_VALUES.map((value) => ({
    value,
    label: CALL_OUTCOME_LABELS[value],
  }));

export function normalizeCallOutcome(value?: string | null): CallOutcome | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (CALL_OUTCOME_VALUES.includes(trimmed as CallOutcome)) {
    return trimmed as CallOutcome;
  }
  return null;
}

export function getCallOutcomeMetadata(value?: string | null) {
  const normalized = normalizeCallOutcome(value);
  if (normalized) {
    return {
      value: normalized,
      label: CALL_OUTCOME_LABELS[normalized],
    };
  }
  return {
    value: null,
    label: "Not recorded",
  };
}
