import type { SupabaseClient } from "@supabase/supabase-js";

import { ASKBOB_AUTOMATED_SCRIPT_PREFIX } from "@/lib/domain/askbob/constants";
import { truncateAskBobScriptSummary } from "@/lib/domain/askbob/summary";
import {
  ASKBOB_AUTOMATED_GREETING_STYLE_DEFAULT,
  ASKBOB_AUTOMATED_VOICE_DEFAULT,
  AskBobSpeechPlanInput,
  SPEECH_PLAN_METADATA_MARKER,
} from "@/lib/domain/askbob/speechPlan";
import { ASKBOB_AUTOMATED_CALL_SCRIPT_PREVIEW_LIMIT } from "@/lib/domain/askbob/automatedCallConfig";
type TwilioStatusEntry = {
  status: string;
  rank: number;
  terminal: boolean;
  failure?: boolean;
};

const TWILIO_STATUS_PRECEDENCE_LIST: TwilioStatusEntry[] = [
  { status: "queued", rank: 1, terminal: false },
  { status: "initiated", rank: 2, terminal: false },
  { status: "ringing", rank: 3, terminal: false },
  { status: "in-progress", rank: 4, terminal: false },
  { status: "answered", rank: 5, terminal: false },
  { status: "completed", rank: 6, terminal: true },
  { status: "failed", rank: 7, terminal: true, failure: true },
  { status: "busy", rank: 7, terminal: true, failure: true },
  { status: "no-answer", rank: 7, terminal: true, failure: true },
  { status: "canceled", rank: 7, terminal: true, failure: true },
];

const TWILIO_STATUS_METADATA = new Map(
  TWILIO_STATUS_PRECEDENCE_LIST.map((entry) => [entry.status, entry]),
);

const TWILIO_IN_PROGRESS_STATUSES = new Set(
  TWILIO_STATUS_PRECEDENCE_LIST.filter((entry) => !entry.terminal).map((entry) => entry.status),
);

const TWILIO_TERMINAL_STATUSES = new Set(
  TWILIO_STATUS_PRECEDENCE_LIST.filter((entry) => entry.terminal).map((entry) => entry.status),
);

const TWILIO_DIAL_FAILURE_STATUSES = new Set(
  TWILIO_STATUS_PRECEDENCE_LIST.filter((entry) => entry.failure).map((entry) => entry.status),
);

const TWILIO_DIAL_BLOCKED_STATUSES = new Set<string>([
  ...TWILIO_IN_PROGRESS_STATUSES,
  ...TWILIO_TERMINAL_STATUSES,
]);

function normalizeTwilioStatus(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export function isTwilioTerminalStatus(value?: string | null): boolean {
  const normalized = normalizeTwilioStatus(value);
  return normalized !== null && TWILIO_TERMINAL_STATUSES.has(normalized);
}

export function isTerminalTwilioStatus(value?: string | null): boolean {
  return isTwilioTerminalStatus(value);
}

export function isTerminalTwilioDialStatus(value?: string | null): boolean {
  return isTwilioTerminalStatus(value);
}

export function isDialInProgressTwilioStatus(value?: string | null): boolean {
  const normalized = normalizeTwilioStatus(value);
  return normalized !== null && TWILIO_IN_PROGRESS_STATUSES.has(normalized);
}

export const TWILIO_DIAL_IN_PROGRESS_STATUSES = new Set(TWILIO_IN_PROGRESS_STATUSES);
export { TWILIO_DIAL_FAILURE_STATUSES };

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
  twilio_recording_sid?: string | null;
  twilio_recording_url?: string | null;
  twilio_recording_duration_seconds?: number | null;
  twilio_recording_received_at?: string | null;
};

export type CallAutomatedDialSnapshot = {
  callId: string;
  workspaceId: string;
  twilioCallSid: string | null;
  twilioStatus: string | null;
  twilioStatusUpdatedAt: string | null;
  isTerminal: boolean;
  isInProgress: boolean;
  hasRecordingMetadata: boolean;
  hasRecordingReady: boolean;
  hasTranscriptOrNotes: boolean;
  hasOutcome: boolean;
  hasOutcomeNotes: boolean;
  reachedCustomer: boolean | null;
};

export type CallSessionFollowupReadinessReason =
  | "not_terminal"
  | "missing_outcome"
  | "missing_reached_flag"
  | "no_call_session";

export type CallSessionFollowupReadiness = {
  isReady: boolean;
  reasons: CallSessionFollowupReadinessReason[];
};

type CallSessionReadinessInput = {
  call?: {
    twilio_status?: string | null;
    reached_customer?: boolean | null;
    outcome_code?: string | null;
    outcome_notes?: string | null;
    outcome_recorded_at?: string | null;
  } | null;
  dialSnapshot?: CallAutomatedDialSnapshot | null;
};

export function buildCallSessionFollowupReadiness({
  call,
  dialSnapshot,
}: CallSessionReadinessInput): CallSessionFollowupReadiness {
  if (!call) {
    return { isReady: false, reasons: ["no_call_session"] };
  }
  const status = call.twilio_status?.trim() ?? null;
  const isTerminal =
    dialSnapshot?.isTerminal ?? isTerminalTwilioDialStatus(status);
  const hasOutcome =
    Boolean(call.outcome_recorded_at) ||
    Boolean(call.outcome_code) ||
    Boolean(call.outcome_notes?.trim());
  const hasReachedFlag = call.reached_customer === true || call.reached_customer === false;
  const reasons: CallSessionFollowupReadinessReason[] = [];
  if (!isTerminal) {
    reasons.push("not_terminal");
  }
  if (!hasOutcome) {
    if (isTerminal) {
      reasons.push("missing_outcome");
    }
  }
  if (isTerminal && !hasReachedFlag) {
    reasons.push("missing_reached_flag");
  }
  return { isReady: reasons.length === 0, reasons };
}

type CallSessionForSnapshot = {
  id: string;
  workspace_id: string;
  twilio_call_sid?: string | null;
  twilio_status?: string | null;
  twilio_status_updated_at?: string | null;
  twilio_recording_url?: string | null;
  twilio_recording_sid?: string | null;
  twilio_recording_duration_seconds?: number | null;
  transcript?: string | null;
};

export function buildCallAutomatedDialSnapshot(
  call: CallSessionForSnapshot,
): CallAutomatedDialSnapshot {
  const sanitizedStatus = call.twilio_status?.trim() ?? null;
  const sanitizedNotes = sanitizeAutomatedCallNotes(call.transcript ?? null);
  return {
    callId: call.id,
    workspaceId: call.workspace_id,
    twilioCallSid: call.twilio_call_sid ?? null,
    twilioStatus: call.twilio_status ?? null,
    twilioStatusUpdatedAt: call.twilio_status_updated_at ?? null,
    isTerminal: isTerminalTwilioDialStatus(sanitizedStatus),
    isInProgress: isDialInProgressTwilioStatus(sanitizedStatus),
    hasRecordingMetadata: Boolean(call.twilio_recording_url || call.twilio_recording_sid),
    hasRecordingReady: call.twilio_recording_duration_seconds != null,
    hasTranscriptOrNotes: Boolean(sanitizedNotes),
    hasOutcome:
      Boolean(call.outcome_recorded_at) ||
      Boolean(call.outcome_code) ||
      Boolean(call.outcome_notes?.trim()),
    hasOutcomeNotes: Boolean(call.outcome_notes?.trim()),
    reachedCustomer: call.reached_customer ?? null,
  };
}

export type CallSessionOutcomeMissingReason =
  | "missing_outcome"
  | "missing_reached_flag"
  | "ready";

export function getCallSessionOutcomeMissingReason(
  snapshot?: Pick<CallAutomatedDialSnapshot, "isTerminal" | "hasOutcome" | "reachedCustomer"> | null,
): CallSessionOutcomeMissingReason {
  if (!snapshot || !snapshot.isTerminal) {
    return "ready";
  }
  if (!snapshot.hasOutcome) {
    return "missing_outcome";
  }
  if (snapshot.reachedCustomer === null || snapshot.reachedCustomer === undefined) {
    return "missing_reached_flag";
  }
  return "ready";
}

export const AUTOMATED_CALL_NOTES_MAX_LENGTH = 1000;

export function sanitizeAutomatedCallNotes(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed.length) {
    return null;
  }
  const collapsed = trimmed.replace(/\s+/g, " ");
  if (collapsed.length <= AUTOMATED_CALL_NOTES_MAX_LENGTH) {
    return collapsed;
  }
  const truncated = collapsed.slice(0, AUTOMATED_CALL_NOTES_MAX_LENGTH - 3).trimEnd();
  return `${truncated}...`;
}

export type CallSpeechPlan = {
  voice: string;
  greetingStyle: string;
  allowVoicemail: boolean;
  scriptSummary: string | null;
};

function buildCallSummaryWithSpeechPlan(plan: AskBobSpeechPlanInput): string {
  const baseScript = plan.scriptSummary?.trim() || "Automated call";
  const truncatedScript = truncateAskBobScriptSummary(baseScript);
  const summaryBody = `${ASKBOB_AUTOMATED_SCRIPT_PREFIX} ${truncatedScript}`;
  const metadataPayload = JSON.stringify({
    voice: plan.voice,
    greetingStyle: plan.greetingStyle,
    allowVoicemail: plan.allowVoicemail,
    scriptSummary: truncatedScript,
  });
  return `${summaryBody}${SPEECH_PLAN_METADATA_MARKER}${metadataPayload}`;
}

export function parseCallSpeechPlan(summary?: string | null): CallSpeechPlan | null {
  if (!summary) {
    return null;
  }
  const markerIndex = summary.indexOf(SPEECH_PLAN_METADATA_MARKER);
  if (markerIndex === -1) {
    return null;
  }
  try {
    const metadataText = summary.slice(markerIndex + SPEECH_PLAN_METADATA_MARKER.length).trim();
    if (!metadataText) {
      return null;
    }
    const parsed = JSON.parse(metadataText);
    return {
      voice: typeof parsed.voice === "string" && parsed.voice.length > 0 ? parsed.voice : ASKBOB_AUTOMATED_VOICE_DEFAULT,
      greetingStyle:
        typeof parsed.greetingStyle === "string" && parsed.greetingStyle.length > 0
          ? parsed.greetingStyle
          : ASKBOB_AUTOMATED_GREETING_STYLE_DEFAULT,
      allowVoicemail: Boolean(parsed.allowVoicemail),
      scriptSummary: typeof parsed.scriptSummary === "string" ? parsed.scriptSummary : null,
    };
  } catch {
    return null;
  }
}

export async function updateCallSessionAutomatedSpeechPlan({
  supabase,
  workspaceId,
  callId,
  plan,
}: {
  supabase: SupabaseClient;
  workspaceId: string;
  callId: string;
  plan: AskBobSpeechPlanInput;
}): Promise<CallSpeechPlan> {
  const summary = buildCallSummaryWithSpeechPlan(plan);
  const { error } = await supabase
    .from("calls")
    .update({
      summary,
    })
    .eq("id", callId)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw error;
  }

  return parseCallSpeechPlan(summary) ?? {
    voice: plan.voice,
    greetingStyle: plan.greetingStyle,
    allowVoicemail: plan.allowVoicemail,
    scriptSummary: plan.scriptSummary?.trim() ?? null,
  };
}

export type GetCallSessionAutomatedSpeechPlanParams = {
  supabase: SupabaseClient;
  workspaceId: string;
  callId: string;
  summary?: string | null;
};

export async function getCallSessionAutomatedSpeechPlan({
  supabase,
  workspaceId,
  callId,
  summary: providedSummary,
}: GetCallSessionAutomatedSpeechPlanParams): Promise<CallSpeechPlan | null> {
  let summary = providedSummary ?? null;
  if (!summary) {
    const { data, error } = await supabase
      .from("calls")
      .select("summary")
      .eq("id", callId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    summary = data?.summary ?? null;
  }

  if (!summary) {
    return null;
  }

  const plan = parseCallSpeechPlan(summary);
  if (!plan) {
    return null;
  }

  return {
    ...plan,
    scriptSummary: plan.scriptSummary
      ? truncateAskBobScriptSummary(plan.scriptSummary, ASKBOB_AUTOMATED_CALL_SCRIPT_PREVIEW_LIMIT)
      : null,
  };
}

export type GetCallSessionJobAndCustomerParams = {
  supabase: SupabaseClient;
  workspaceId: string;
  callId: string;
  existingJobId?: string | null;
  existingCustomerId?: string | null;
};

export async function getCallSessionJobAndCustomer({
  supabase,
  workspaceId,
  callId,
  existingJobId,
  existingCustomerId,
}: GetCallSessionJobAndCustomerParams): Promise<{ jobId: string | null; customerId: string | null }> {
  if (existingJobId !== undefined && existingCustomerId !== undefined) {
    return { jobId: existingJobId, customerId: existingCustomerId };
  }
  const { data, error } = await supabase
    .from("calls")
    .select("job_id, customer_id")
    .eq("id", callId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    jobId: data?.job_id ?? null,
    customerId: data?.customer_id ?? null,
  };
}

export type GetCallSessionAutomatedNotesParams = {
  supabase: SupabaseClient;
  workspaceId: string;
  callId: string;
};

export async function getCallSessionAutomatedNotes(
  params: GetCallSessionAutomatedNotesParams,
): Promise<string | null> {
  const { supabase, workspaceId, callId } = params;
  const { data, error } = await supabase
    .from("calls")
    .select("transcript")
    .eq("id", callId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return sanitizeAutomatedCallNotes(data?.transcript ?? null);
}

export type UpdateCallSessionAutomatedNotesParams = {
  supabase: SupabaseClient;
  workspaceId: string;
  callId: string;
  notes?: string | null;
};

export async function updateCallSessionAutomatedNotes(
  params: UpdateCallSessionAutomatedNotesParams,
): Promise<string | null> {
  const { supabase, workspaceId, callId, notes } = params;
  const sanitized = sanitizeAutomatedCallNotes(notes ?? null);

  const { data: existingRow, error: fetchError } = await supabase
    .from("calls")
    .select("transcript")
    .eq("id", callId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (!existingRow) {
    throw new Error("Call not found");
  }

  const existingSanitized = sanitizeAutomatedCallNotes(existingRow.transcript ?? null);
  if (existingSanitized === sanitized) {
    return sanitized;
  }

  const { error } = await supabase
    .from("calls")
    .update({
      transcript: sanitized,
    })
    .eq("id", callId)
    .eq("workspace_id", workspaceId);

  if (error) {
    throw error;
  }

  return sanitized;
}

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

type CallSessionTwilioStatusUpdateReason = "applied" | "precedence_ignored";

export type CallSessionTwilioStatusUpdateResult = {
  applied: boolean;
  currentStatus: string | null;
  reason: CallSessionTwilioStatusUpdateReason;
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

export type CreateCallSessionResult =
  | { success: true; call: CallSessionRow }
  | { success: false; error: unknown };

export async function createCallSessionForJobQuote(
  params: CreateCallSessionForJobQuoteParams,
): Promise<CreateCallSessionResult> {
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
    return { success: false, error };
  }

  if (!data) {
    return { success: false, error: new Error("Failed to create call session") };
  }

  return { success: true, call: data };
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

export type UpdateCallSessionRecordingParams = {
  supabase: SupabaseClient;
  callId?: string;
  workspaceId?: string;
  twilioCallSid?: string;
  recordingSid?: string | null;
  recordingUrl?: string | null;
  recordingDurationSeconds?: number | null;
  recordingReceivedAt?: string | null;
};

export type UpdateCallSessionRecordingResult = {
  callId: string;
  workspaceId: string;
  applied: boolean;
  duplicate: boolean;
};

export async function updateCallSessionRecordingMetadata(
  params: UpdateCallSessionRecordingParams,
): Promise<UpdateCallSessionRecordingResult | null> {
  const {
    supabase,
    callId,
    workspaceId,
    twilioCallSid,
    recordingSid,
    recordingUrl,
    recordingDurationSeconds,
    recordingReceivedAt,
  } = params;
  if (!callId && !twilioCallSid) {
    return null;
  }

  const normalizedSid = recordingSid?.trim() ?? null;
  const normalizedUrl = recordingUrl?.trim() ?? null;
  const timestamp = recordingReceivedAt ?? new Date().toISOString();

  let query = supabase.from("calls").select(
    "id, workspace_id, twilio_recording_sid, twilio_recording_url, twilio_recording_duration_seconds",
  );
  if (callId) {
    query = query.eq("id", callId);
  }
  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }
  if (twilioCallSid) {
    query = query.eq("twilio_call_sid", twilioCallSid);
  }

  const { data: existingRow, error: fetchError } = await query.maybeSingle();
  if (fetchError) {
    throw fetchError;
  }

  if (!existingRow?.id) {
    return null;
  }

  const payload: Record<string, unknown> = {};
  if (normalizedSid && !existingRow.twilio_recording_sid) {
    payload.twilio_recording_sid = normalizedSid;
  }
  if (normalizedUrl && !existingRow.twilio_recording_url) {
    payload.twilio_recording_url = normalizedUrl;
  }
  if (
    recordingDurationSeconds !== undefined &&
    recordingDurationSeconds !== null &&
    existingRow.twilio_recording_duration_seconds == null
  ) {
    payload.twilio_recording_duration_seconds = recordingDurationSeconds;
  }

  if (Object.keys(payload).length > 0) {
    payload.twilio_recording_received_at = timestamp;
  }

  let appliedRecord = false;
  if (Object.keys(payload).length > 0) {
    const { error } = await supabase
      .from("calls")
      .update(payload)
      .eq("id", existingRow.id)
      .eq("workspace_id", existingRow.workspace_id);

    if (error) {
      throw error;
    }
    appliedRecord = true;
  }

  const duplicate = !appliedRecord && normalizedSid && normalizedSid === existingRow.twilio_recording_sid;

  return {
    callId: existingRow.id,
    workspaceId: existingRow.workspace_id,
    applied: appliedRecord,
    duplicate,
  };
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
  const currentInfo =
    normalizedCurrentStatus !== null ? TWILIO_STATUS_METADATA.get(normalizedCurrentStatus) ?? null : null;
  const incomingInfo =
    normalizedIncomingStatus !== null ? TWILIO_STATUS_METADATA.get(normalizedIncomingStatus) ?? null : null;

  let shouldUpdateStatus = false;
  let reason: CallSessionTwilioStatusUpdateReason = "precedence_ignored";

  if (incomingInfo) {
    if (currentInfo?.terminal) {
      if (incomingInfo.terminal && incomingInfo.status === currentInfo.status) {
        shouldUpdateStatus = true;
        reason = "applied";
      }
    } else {
      const currentRank = currentInfo?.rank ?? 0;
      if (incomingInfo.rank >= currentRank) {
        shouldUpdateStatus = true;
        reason = "applied";
      }
    }
  }

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
    reason,
  };
}
