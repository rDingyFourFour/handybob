import type { CallOutcomeCode } from "@/lib/domain/communications/callOutcomes";

export type CallOutcomePrefillPayload = {
  reachedCustomer?: boolean | null;
  outcomeCode?: CallOutcomeCode | null;
  notes?: string | null;
};

const OUTCOME_PREFILL_KEY_PREFIX = "askbob-call-outcome-prefill";
const PREFILL_CACHE = new Map<string, CallOutcomePrefillPayload | null>();

function buildPrefillKey(callId: string) {
  return `${OUTCOME_PREFILL_KEY_PREFIX}-${callId}`;
}

function safeParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function readAndClearCallOutcomePrefill(callId: string) {
  if (PREFILL_CACHE.has(callId)) {
    return PREFILL_CACHE.get(callId) ?? null;
  }
  if (typeof window === "undefined") {
    PREFILL_CACHE.set(callId, null);
    return null;
  }
  const key = buildPrefillKey(callId);
  const raw = window.sessionStorage.getItem(key);
  if (!raw) {
    PREFILL_CACHE.set(callId, null);
    return null;
  }
  window.sessionStorage.removeItem(key);
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object") {
    PREFILL_CACHE.set(callId, null);
    return null;
  }
  const payload = parsed as CallOutcomePrefillPayload;
  PREFILL_CACHE.set(callId, payload);
  return parsed as CallOutcomePrefillPayload;
}
