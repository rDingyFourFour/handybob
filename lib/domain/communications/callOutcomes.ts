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

export const CALL_OUTCOME_CODE_VALUES = [
  "reached_scheduled",
  "reached_needs_followup",
  "reached_declined",
  "no_answer_left_voicemail",
  "no_answer_no_voicemail",
  "wrong_number",
  "other",
] as const;

export type CallOutcomeCode = (typeof CALL_OUTCOME_CODE_VALUES)[number];

export const CALL_OUTCOME_CODE_LABELS: Record<CallOutcomeCode, string> = {
  reached_scheduled: "Reached · Scheduled",
  reached_needs_followup: "Reached · Needs follow-up",
  reached_declined: "Reached · Declined",
  no_answer_left_voicemail: "No answer · Left voicemail",
  no_answer_no_voicemail: "No answer · No voicemail",
  wrong_number: "Wrong number",
  other: "Other outcome",
};

export const CALL_OUTCOME_CODE_OPTIONS: Array<{ value: CallOutcomeCode; label: string }> =
  CALL_OUTCOME_CODE_VALUES.map((value) => ({
    value,
    label: CALL_OUTCOME_CODE_LABELS[value],
  }));

export function getCallOutcomeCodeMetadata(value?: string | null) {
  if (!value) {
    return { value: null, label: "Not recorded" };
  }
  const normalized = value.trim();
  if (!normalized) {
    return { value: null, label: "Not recorded" };
  }
  if (CALL_OUTCOME_CODE_VALUES.includes(normalized as CallOutcomeCode)) {
    const typed = normalized as CallOutcomeCode;
    return {
      value: typed,
      label: CALL_OUTCOME_CODE_LABELS[typed],
    };
  }
  return { value: null, label: "Not recorded" };
}

export function mapOutcomeCodeToLegacyOutcome(value?: string | null): CallOutcome | null {
  if (!value) {
    return null;
  }
  switch (value) {
    case "reached_scheduled":
    case "reached_needs_followup":
    case "reached_declined":
      return "reached";
    case "no_answer_left_voicemail":
      return "voicemail";
    case "no_answer_no_voicemail":
      return "no_answer";
    case "wrong_number":
      return "wrong_number";
    case "other":
      return "other";
    default:
      return null;
  }
}
