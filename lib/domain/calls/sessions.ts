import type { SupabaseClient } from "@supabase/supabase-js";

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

type AttachTwilioMetadataParams = {
  supabase: SupabaseClient;
  callId: string;
  twilioCallSid: string;
  initialStatus?: string | null;
};

export async function attachTwilioMetadataToCallSession(
  params: AttachTwilioMetadataParams
): Promise<void> {
  const { supabase, callId, twilioCallSid, initialStatus } = params;
  const { error } = await supabase
    .from("calls")
    .update({
      twilio_call_sid: twilioCallSid,
      twilio_status: initialStatus ?? null,
      twilio_status_updated_at: new Date().toISOString(),
      twilio_error_code: null,
      twilio_error_message: null,
    })
    .eq("id", callId);

  if (error) {
    throw error;
  }

  if (initialStatus) {
    console.log("[calls-twilio-status-updated]", {
      callId,
      twilioStatus: initialStatus,
      hasErrorCode: false,
    });
  }
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
): Promise<void> {
  const { supabase, callId, twilioStatus, errorCode, errorMessage } = params;
  const { error } = await supabase
    .from("calls")
    .update({
      twilio_status: twilioStatus,
      twilio_status_updated_at: new Date().toISOString(),
      twilio_error_code: errorCode ?? null,
      twilio_error_message: errorMessage ?? null,
    })
    .eq("id", callId);

  if (error) {
    throw error;
  }

  console.log("[calls-twilio-status-updated]", {
    callId,
    twilioStatus,
    hasErrorCode: Boolean(errorCode),
  });
}
