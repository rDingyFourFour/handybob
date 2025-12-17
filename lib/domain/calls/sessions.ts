import type { SupabaseClient } from "@supabase/supabase-js";

const TWILIO_STATUS_PRECEDENCE: Record<string, number> = {
  queued: 1,
  initiated: 2,
  ringing: 3,
  "in-progress": 4,
  answered: 5,
  completed: 6,
  failed: 7,
  busy: 7,
  "no-answer": 7,
  canceled: 7,
};

const TWILIO_IN_PROGRESS_STATUSES = new Set<string>([
  "queued",
  "initiated",
  "ringing",
  "in-progress",
  "answered",
]);

const TWILIO_TERMINAL_STATUSES = new Set<string>([
  "completed",
  "failed",
  "busy",
  "no-answer",
  "canceled",
]);

const TWILIO_DIAL_BLOCKED_STATUSES = new Set<string>([
  ...TWILIO_IN_PROGRESS_STATUSES,
  ...TWILIO_TERMINAL_STATUSES,
]);

function normalizeTwilioStatus(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export const TWILIO_DIAL_IN_PROGRESS_STATUSES = new Set(TWILIO_IN_PROGRESS_STATUSES);
export const TWILIO_DIAL_FAILURE_STATUSES = new Set(TWILIO_TERMINAL_STATUSES);

export type CreateCallSessionForJobQuoteParams = {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  jobId: string;
  customerId?: string | null;
  fromNumber: string;
  toNumber: string;
  quoteId?: string | null;
  scriptBody?: string | null;
  summaryOverride?: string | null;
};

export type CallSessionRow = {
  id: string;
  workspace_id: string;
  job_id: string;
  twilio_call_sid?: string | null;
  twilio_status?: string | null;
  twilio_status_updated_at?: string | null;
  twilio_error_code?: string | null;
  twilio_error_message?: string | null;
};

export type EnsureInboundCallSessionParams = {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  twilioCallSid: string;
  fromNumber?: string | null;
  toNumber?: string | null;
  customerId?: string | null;
  jobId?: string | null;
};

export type EnsureInboundCallSessionResult = {
  callId: string;
  isNew: boolean;
};

export type LinkCallToCustomerJobResult = {
  callId: string;
  customerId: string;
  jobId: string | null;
  direction: string | null;
};

export type CallSessionDialRequestedResult =
  | { outcome: "allowed_to_dial"; callId: string }
  | { outcome: "already_in_progress"; callId: string; currentStatus: string | null }
  | { outcome: "already_completed"; callId: string; currentStatus: string | null }
  | { outcome: "not_found"; callId: string }
  | { outcome: "not_owned"; callId: string };

export type CallSessionTwilioStatusUpdateResult = {
  applied: boolean;
  currentStatus: string | null;
};

export type MarkCallSessionDialRequestedParams = {
  supabase: SupabaseClient;
  workspaceId: string;
  callId: string;
};

export async function markCallSessionDialRequested(
  params: MarkCallSessionDialRequestedParams,
): Promise<CallSessionDialRequestedResult> {
  const { supabase, workspaceId, callId } = params;
  const now = new Date().toISOString();
  const blockedStatuses = Array.from(TWILIO_DIAL_BLOCKED_STATUSES);
  const { data: updateData, error: updateError } = await supabase
    .from("calls")
    .update({
      twilio_status: "queued",
      twilio_status_updated_at: now,
    })
    .eq("id", callId)
    .eq("workspace_id", workspaceId)
    .not("twilio_status", "in", blockedStatuses)
    .select("twilio_status");

  if (updateError) {
    throw updateError;
  }

  if (Array.isArray(updateData) && updateData.length > 0) {
    return { outcome: "allowed_to_dial", callId };
  }

  const { data: existingRow, error: existingError } = await supabase
    .from("calls")
    .select("workspace_id, twilio_status")
    .eq("id", callId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (!existingRow) {
    return { outcome: "not_found", callId };
  }

  if (existingRow.workspace_id !== workspaceId) {
    return { outcome: "not_owned", callId };
  }

  const normalizedStatus = normalizeTwilioStatus(existingRow.twilio_status);
  const isTerminal = normalizedStatus !== null && TWILIO_TERMINAL_STATUSES.has(normalizedStatus);
  return {
    outcome: isTerminal ? "already_completed" : "already_in_progress",
    callId,
    currentStatus: existingRow.twilio_status ?? null,
  };
}

export async function createCallSessionForJobQuote(
  params: CreateCallSessionForJobQuoteParams
): Promise<CallSessionRow> {
  const { supabase, workspaceId, userId, jobId, customerId, fromNumber, toNumber, scriptBody } =
    params;
  const { summaryOverride } = params;
  const normalizedScriptBody = scriptBody?.trim();
  const askBobSummary =
    (summaryOverride?.trim() || (normalizedScriptBody && normalizedScriptBody.length
      ? `AskBob call script: ${normalizedScriptBody}`
      : null)) ?? null;
  const payload = {
    workspace_id: workspaceId,
    user_id: userId,
    job_id: jobId,
    customer_id: customerId ?? null,
    from_number: fromNumber,
    to_number: toNumber,
    direction: "outbound",
    status: "pending",
    started_at: new Date().toISOString(),
    duration_seconds: 0,
    summary: askBobSummary,
  };

  const { data, error } = await supabase
    .from("calls")
    .insert(payload)
    .select("id, workspace_id, job_id")
    .single();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Failed to create call session");
  }

  return data;
}

export async function ensureInboundCallSession(
  params: EnsureInboundCallSessionParams,
): Promise<EnsureInboundCallSessionResult> {
  const {
    supabase,
    workspaceId,
    userId,
    twilioCallSid,
    fromNumber,
    toNumber,
    customerId,
    jobId,
  } = params;
  const trimmedSid = twilioCallSid.trim();

  const { data: existingSession, error: fetchError } = await supabase
    .from("calls")
    .select("id, customer_id")
    .eq("workspace_id", workspaceId)
    .eq("twilio_call_sid", trimmedSid)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (existingSession?.id) {
    if (customerId && !existingSession.customer_id) {
      await supabase
        .from("calls")
        .update({
          customer_id: customerId,
        })
        .eq("id", existingSession.id);
    }
    return { callId: existingSession.id, isNew: false };
  }

  const now = new Date().toISOString();
  const payload = {
    workspace_id: workspaceId,
    user_id: userId,
    direction: "inbound",
    status: "pending",
    summary: "Inbound call",
    from_number: fromNumber ?? null,
    to_number: toNumber ?? null,
    customer_id: customerId ?? null,
    job_id: jobId ?? null,
    twilio_call_sid: trimmedSid,
    started_at: now,
    duration_seconds: 0,
  };

  const { data, error } = await supabase
    .from("calls")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  if (!data?.id) {
    throw new Error("Failed to insert inbound call session");
  }

  return { callId: data.id, isNew: true };
}

export async function linkCallToCustomerJob({
  supabase,
  workspaceId,
  callId,
  customerId,
  jobId,
}: {
  supabase: SupabaseClient;
  workspaceId: string;
  callId: string;
  customerId: string;
  jobId?: string | null;
}): Promise<LinkCallToCustomerJobResult> {
  const { data: existingCall, error: fetchError } = await supabase
    .from("calls")
    .select("id, workspace_id, direction")
    .eq("id", callId)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (!existingCall) {
    throw new Error("Call not found");
  }

  if (existingCall.workspace_id !== workspaceId) {
    throw new Error("Call does not belong to workspace");
  }

  const { error: updateError } = await supabase
    .from("calls")
    .update({
      customer_id: customerId,
      job_id: jobId ?? null,
    })
    .eq("id", callId)
    .eq("workspace_id", workspaceId);

  if (updateError) {
    throw updateError;
  }

  return {
    callId,
    customerId,
    jobId: jobId ?? null,
    direction: existingCall.direction ?? null,
  };
}

export type SetTwilioDialResultForCallSessionParams = {
  supabase: SupabaseClient;
  workspaceId: string;
  callId: string;
  twilioStatus: string;
  twilioCallSid?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export async function setTwilioDialResultForCallSession(
  params: SetTwilioDialResultForCallSessionParams,
): Promise<void> {
  const { supabase, workspaceId, callId, twilioStatus, twilioCallSid, errorCode, errorMessage } = params;
  const updatePayload: {
    twilio_status: string;
    twilio_status_updated_at: string;
    twilio_error_code: string | null;
    twilio_error_message: string | null;
    twilio_call_sid?: string | null;
  } = {
    twilio_status: twilioStatus,
    twilio_status_updated_at: new Date().toISOString(),
    twilio_error_code: errorCode ?? null,
    twilio_error_message: errorMessage ?? null,
  };

  if (twilioCallSid !== undefined) {
    updatePayload.twilio_call_sid = twilioCallSid;
  }

  const { error } = await supabase
    .from("calls")
    .update(updatePayload)
    .eq("id", callId)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw error;
  }

  console.log("[calls-twilio-status-updated]", {
    callId,
    twilioStatus,
    hasErrorCode: Boolean(errorCode),
    hasTwilioCallSid: typeof twilioCallSid === "string" && twilioCallSid.length > 0,
  });
}

type UpdateTwilioStatusParams = {
  supabase: SupabaseClient;
  callId: string;
  twilioStatus: string;
  errorCode?: string | number | null;
  errorMessage?: string | null;
};

export async function updateCallSessionTwilioStatus(
  params: UpdateTwilioStatusParams
): Promise<CallSessionTwilioStatusUpdateResult> {
  const { supabase, callId, twilioStatus, errorCode, errorMessage } = params;
  const normalizedIncomingStatus = normalizeTwilioStatus(twilioStatus);
  const { data: existingRow, error: fetchError } = await supabase
    .from("calls")
    .select("twilio_status")
    .eq("id", callId)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (!existingRow) {
    throw new Error("Call not found");
  }

  const normalizedCurrentStatus = normalizeTwilioStatus(existingRow.twilio_status);
  const currentRank =
    normalizedCurrentStatus !== null
      ? TWILIO_STATUS_PRECEDENCE[normalizedCurrentStatus] ?? 0
      : 0;
  const incomingRank =
    normalizedIncomingStatus !== null
      ? TWILIO_STATUS_PRECEDENCE[normalizedIncomingStatus] ?? 0
      : 0;
  const shouldUpdateStatus =
    normalizedIncomingStatus !== null &&
    (normalizedCurrentStatus === null || incomingRank >= currentRank);

  const updatePayload: {
    twilio_status?: string | null;
    twilio_status_updated_at: string;
    twilio_error_code: string | null;
    twilio_error_message: string | null;
  } = {
    twilio_status_updated_at: new Date().toISOString(),
    twilio_error_code: errorCode ?? null,
    twilio_error_message: errorMessage ?? null,
  };

  if (shouldUpdateStatus) {
    updatePayload.twilio_status = normalizedIncomingStatus;
  }

  const { error } = await supabase
    .from("calls")
    .update(updatePayload)
    .eq("id", callId);

  if (error) {
    throw error;
  }

  return {
    applied: shouldUpdateStatus,
    currentStatus: existingRow.twilio_status ?? null,
  };
}
