type AskBobMessageDraftPayload = {
  body: string;
  createdAtIso: string;
  origin: string;
  jobId: string;
  customerId?: string | null;
};

const MESSAGE_DRAFT_PREFIX = "askbob-after-call-draft";

function buildDraftKey(jobId: string) {
  const timestamp = Date.now();
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${MESSAGE_DRAFT_PREFIX}-${jobId}-${timestamp}-${suffix}`;
}

export function cacheAskBobMessageDraft(payload: {
  body: string;
  jobId: string;
  customerId?: string | null;
  origin?: string;
}) {
  if (!payload.body) {
    return null;
  }
  if (typeof window === "undefined") {
    return null;
  }
  const key = buildDraftKey(payload.jobId);
  const entry: AskBobMessageDraftPayload = {
    body: payload.body,
    createdAtIso: new Date().toISOString(),
    origin: payload.origin ?? "askbob-after-call",
    jobId: payload.jobId,
    customerId: payload.customerId ?? null,
  };
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entry));
    return key;
  } catch (error) {
    console.error("[askbob-after-call-draft] failed to cache message draft", error);
    return null;
  }
}
