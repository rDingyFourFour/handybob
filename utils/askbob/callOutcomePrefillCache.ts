import type { CallOutcomeCode } from "@/lib/domain/communications/callOutcomes";

export type CallOutcomePrefillPayload = {
  callId: string;
  workspaceId: string;
  suggestedReachedCustomer: boolean | null;
  suggestedOutcomeCode: CallOutcomeCode | null;
  suggestedNotes?: string | null;
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
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(buildPrefillKey(callId));
      } catch (error) {
        console.error("[askbob-call-outcome-prefill] failed to clear cached suggestion", error);
      }
    }
    return PREFILL_CACHE.get(callId) ?? null;
  }
  if (typeof window === "undefined") {
    return null;
  }
  const key = buildPrefillKey(callId);
  const raw = window.sessionStorage.getItem(key);
  if (!raw) {
    return null;
  }
  window.sessionStorage.removeItem(key);
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const payload = parsed as CallOutcomePrefillPayload;
  if (payload.callId !== callId) {
    return null;
  }
  PREFILL_CACHE.set(callId, payload);
  return payload;
}

export function cacheCallOutcomePrefill(payload: CallOutcomePrefillPayload) {
  if (typeof window === "undefined") {
    return null;
  }
  if (!payload.callId || !payload.workspaceId) {
    return null;
  }
  const key = buildPrefillKey(payload.callId);
  const entry: CallOutcomePrefillPayload = {
    callId: payload.callId,
    workspaceId: payload.workspaceId,
    suggestedReachedCustomer: payload.suggestedReachedCustomer ?? null,
    suggestedOutcomeCode: payload.suggestedOutcomeCode ?? null,
    suggestedNotes: payload.suggestedNotes ?? null,
  };
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entry));
    PREFILL_CACHE.set(payload.callId, entry);
    return key;
  } catch (error) {
    console.error("[askbob-call-outcome-prefill] failed to cache suggestion", error);
    return null;
  }
}
