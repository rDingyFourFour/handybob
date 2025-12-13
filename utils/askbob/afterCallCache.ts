import type { AskBobJobAfterCallResult } from "@/lib/domain/askbob/types";

const AFTER_CALL_CACHE_PREFIX = "askbob-after-call-result";
const AFTER_CALL_CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes
const AFTER_CALL_CACHE = new Map<string, AskBobAfterCallCachePayload>();

type AskBobAfterCallCachePayload = {
  jobId: string;
  callId: string;
  result: AskBobJobAfterCallResult;
  createdAtIso: string;
};

function buildCacheKey(jobId: string) {
  const timestamp = Date.now();
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${AFTER_CALL_CACHE_PREFIX}-${jobId}-${timestamp}-${suffix}`;
}

function safeParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function cacheAskBobAfterCallResult(
  jobId: string,
  callId: string,
  result: AskBobJobAfterCallResult,
) {
  const key = buildCacheKey(jobId);
  const payload: AskBobAfterCallCachePayload = {
    jobId,
    callId,
    result,
    createdAtIso: new Date().toISOString(),
  };
  AFTER_CALL_CACHE.set(key, payload);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(payload));
    } catch (error) {
      console.error("[askbob-after-call-cache] failed to persist payload", error);
    }
  }
  return key;
}

export function readAndClearAskBobAfterCallResult(key: string | null | undefined) {
  if (!key) {
    return null;
  }
  if (AFTER_CALL_CACHE.has(key)) {
    const cached = AFTER_CALL_CACHE.get(key) ?? null;
    AFTER_CALL_CACHE.delete(key);
    return cached;
  }
  if (typeof window === "undefined") {
    return null;
  }
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(key);
  } catch (error) {
    console.error("[askbob-after-call-cache] failed to read cached payload", error);
  }
  if (!raw) {
    return null;
  }
  try {
    window.sessionStorage.removeItem(key);
  } catch (error) {
    console.error("[askbob-after-call-cache] failed to clear cached payload", error);
  }
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const payload = parsed as AskBobAfterCallCachePayload;
  const createdAt = Date.parse(payload.createdAtIso);
  if (Number.isNaN(createdAt) || Date.now() - createdAt > AFTER_CALL_CACHE_TTL_MS) {
    return null;
  }
  return payload;
}
