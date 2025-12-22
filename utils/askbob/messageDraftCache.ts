type AskBobMessageDraftPayload = {
  body: string;
  createdAtIso: string;
  origin: string;
  jobId: string;
  customerId?: string | null;
  workspaceId?: string | null;
  callId?: string | null;
};

const MESSAGE_DRAFT_PREFIX = "askbob-after-call-draft";
const MESSAGE_DRAFT_MAX_LENGTH = 2000;

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
  workspaceId?: string | null;
  callId?: string | null;
}) {
  if (!payload.body) {
    return null;
  }
  const trimmedBody = payload.body.trim();
  if (!trimmedBody) {
    return null;
  }
  if (typeof window === "undefined") {
    return null;
  }
  const normalizedBody =
    trimmedBody.length > MESSAGE_DRAFT_MAX_LENGTH
      ? trimmedBody.slice(0, MESSAGE_DRAFT_MAX_LENGTH)
      : trimmedBody;
  const key = buildDraftKey(payload.jobId);
  const entry: AskBobMessageDraftPayload = {
    body: normalizedBody,
    createdAtIso: new Date().toISOString(),
    origin: payload.origin ?? "askbob-after-call",
    jobId: payload.jobId,
    customerId: payload.customerId ?? null,
    workspaceId: payload.workspaceId ?? null,
    callId: payload.callId ?? null,
  };
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entry));
    return key;
  } catch (error) {
    console.error("[askbob-after-call-draft] failed to cache message draft", error);
    return null;
  }
}
