import type { AskBobCallIntent } from "@/lib/domain/askbob/types";

export type AskBobCallContextCachePayload = {
  scriptBody: string;
  scriptSummary?: string | null;
  intents?: AskBobCallIntent[] | null;
  createdAtIso: string;
};

const CALL_CONTEXT_CACHE_PREFIX = "askbob-call-context";

function buildCallContextKey(jobId: string) {
  return `${CALL_CONTEXT_CACHE_PREFIX}-${jobId}`;
}

function safeParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function cacheAskBobCallContext(
  jobId: string,
  payload: Omit<AskBobCallContextCachePayload, "createdAtIso"> & {
    createdAtIso?: string | null;
  },
) {
  if (typeof window === "undefined") {
    return;
  }
  const key = buildCallContextKey(jobId);
  const entry: AskBobCallContextCachePayload = {
    scriptBody: payload.scriptBody,
    scriptSummary: payload.scriptSummary ?? null,
    intents: payload.intents ?? null,
    createdAtIso: payload.createdAtIso ?? new Date().toISOString(),
  };
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.error("[askbob-call-context-cache] Failed to cache context", error);
  }
}

export function readAndClearAskBobCallContext(jobId: string) {
  if (typeof window === "undefined") {
    return null;
  }
  const key = buildCallContextKey(jobId);
  const raw = window.sessionStorage.getItem(key);
  if (!raw) {
    return null;
  }
  window.sessionStorage.removeItem(key);
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  return parsed as AskBobCallContextCachePayload;
}
