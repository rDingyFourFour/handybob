"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { runAskBobTask } from "@/lib/domain/askbob/service";
import {
  loadCallHistoryForJob,
  computeCallSummarySignals,
} from "@/lib/domain/askbob/callHistory";
import type { CallHistoryRecord } from "@/lib/domain/askbob/callHistory";
import type { AskBobJobAfterCallInput, AskBobJobAfterCallResult } from "@/lib/domain/askbob/types";
import { formatFriendlyDateTime } from "@/utils/timeline/formatters";
import {
  LatestCallOutcomeForJob,
  normalizeCallOutcomeNotes,
} from "@/lib/domain/calls/latestCallOutcome";
import { isAskBobScriptSummary } from "@/lib/domain/askbob/constants";
import {
  AUTOMATED_CALL_NOTES_MAX_LENGTH,
  buildCallAutomatedDialSnapshot,
  buildCallSessionFollowupReadiness,
  CallSessionFollowupReadinessReason,
  sanitizeAutomatedCallNotes,
} from "@/lib/domain/calls/sessions";

const generationSourceSchema = z.enum(["call_session", "job_step_8"]);
type GenerationSource = z.infer<typeof generationSourceSchema>;

const afterCallPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  callId: z.string().min(1).optional().nullable(),
  automatedCallNotes: z.string().max(AUTOMATED_CALL_NOTES_MAX_LENGTH).optional().nullable(),
  generationSource: generationSourceSchema.optional(),
});

const CALL_SESSION_READINESS_MESSAGES: Record<CallSessionFollowupReadinessReason, string> = {
  missing_outcome: "Record the call outcome before generating a follow-up.",
  missing_reached_flag: "Mark whether the customer was reached before generating a follow-up.",
  not_terminal: "Call is still in progress. Wait until it completes before generating a follow-up.",
  no_call_session: "Call session data is unavailable right now. Refresh the page to try again.",
};

function describeCallSessionReadinessIssues(reasons: CallSessionFollowupReadinessReason[]): string {
  return reasons.map((reason) => CALL_SESSION_READINESS_MESSAGES[reason]).join(" ");
}

type AfterCallPayload = z.infer<typeof afterCallPayloadSchema>;

type AfterCallSuccessResult = {
  ok: true;
  jobId: string;
  callId: string;
  result: AskBobJobAfterCallResult;
};
type AfterCallFailureResult = { ok: false; code: string; message?: string; jobId?: string };
type AfterCallActionResult = AfterCallSuccessResult | AfterCallFailureResult;

type JobWithCustomer = {
  id: string;
  workspace_id: string;
  title: string | null;
  description_raw: string | null;
  customer_id: string | null;
  customers:
    | { id: string | null; name: string | null; phone?: string | null }
    | Array<{ id: string | null; name: string | null; phone?: string | null }>
    | null;
};

type CallRow = {
  id: string;
  workspace_id: string | null;
  job_id: string | null;
  status: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  started_at: string | null;
  summary: string | null;
  ai_summary: string | null;
  direction: string | null;
  from_number: string | null;
  to_number: string | null;
  created_at: string | null;
  outcome_code: string | null;
  outcome_notes: string | null;
  outcome_recorded_at: string | null;
  reached_customer: boolean | null;
  transcript: string | null;
  twilio_call_sid?: string | null;
  twilio_status?: string | null;
  twilio_status_updated_at?: string | null;
  twilio_recording_url: string | null;
  twilio_recording_sid?: string | null;
  twilio_recording_duration_seconds: number | null;
  twilio_recording_received_at?: string | null;
};

export async function runAskBobJobAfterCallAction(payload: AfterCallPayload): Promise<AfterCallActionResult> {
  const parsed = afterCallPayloadSchema.parse(payload);
  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    return { ok: false, code: "workspace_unavailable" };
  }

  const generationSource: GenerationSource = parsed.generationSource ?? "job_step_8";
  const isCallSessionGeneration = generationSource === "call_session";

  if (workspace.id !== parsed.workspaceId) {
    console.error("[askbob-after-call-ui-failure] workspace mismatch", {
      expectedWorkspaceId: workspace.id,
      payloadWorkspaceId: parsed.workspaceId,
      userId: user.id,
      jobId: parsed.jobId,
    });
    return { ok: false, code: "wrong_workspace" };
  }
  if (isCallSessionGeneration && !(parsed.callId?.trim())) {
    console.error("[askbob-after-call-ui-failure] missing call id for call-session generation", {
      workspaceId: workspace.id,
      jobId: parsed.jobId,
      generationSource,
    });
    return {
      ok: false,
      code: "missing_call_id",
      message: "Call ID is required when generating a follow-up from the call session.",
    };
  }

  const { data: job, error: jobError } = await supabase
    .from<JobWithCustomer>("jobs")
    .select("id, workspace_id, title, description_raw, customer_id, customers(id, name, phone)")
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.jobId)
    .maybeSingle();

  if (jobError || !job) {
    console.error("[askbob-after-call-ui-failure] job not found", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: parsed.jobId,
    });
    return { ok: false, code: "job_not_found" };
  }

  const call = await loadCallForJob(supabase, parsed, workspace.id);
  if (!call) {
    console.error("[askbob-after-call-ui-failure] no calls for job", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      callId: parsed.callId ?? null,
    });
    return { ok: false, code: "no_calls_for_job", jobId: job.id };
  }

  const dialSnapshot = buildCallAutomatedDialSnapshot(call);
  if (isCallSessionGeneration) {
    const readiness = buildCallSessionFollowupReadiness({ call, dialSnapshot });
    if (!readiness.isReady) {
      const notReadyMessage = describeCallSessionReadinessIssues(readiness.reasons);
      const failureReason =
        readiness.reasons.includes("missing_outcome")
          ? "missing_outcome"
          : readiness.reasons.includes("missing_reached_flag")
          ? "missing_reached_flag"
          : readiness.reasons.includes("not_terminal")
          ? "not_terminal"
          : "no_call_session";
      const failureCode =
        failureReason === "missing_outcome"
          ? "not_ready_missing_outcome"
          : failureReason === "missing_reached_flag"
          ? "not_ready_missing_reached_flag"
          : "not_ready_for_after_call";
      console.log("[askbob-after-call-gate-not-ready]", {
        workspaceId: workspace.id,
        jobId: job.id,
        callId: call.id,
        generationSource,
        reasons: readiness.reasons,
        failureReason,
      });
      return {
        ok: false,
        code: failureCode,
        jobId: job.id,
        message: notReadyMessage,
      };
    }
  }

  const normalizedAutomatedCallNotes = sanitizeAutomatedCallNotes(parsed.automatedCallNotes ?? null);
  const hasOutcome =
    Boolean(call.outcome_recorded_at) ||
    Boolean(call.outcome_code) ||
    Boolean(call.outcome_notes?.trim());
  const hasReachedFlag = call.reached_customer === true || call.reached_customer === false;
  const hasAutomatedCallNotesContext = Boolean(normalizedAutomatedCallNotes);
  const hasLatestCallOutcomeContext =
    Boolean(call.outcome_code) ||
    Boolean(call.outcome_notes?.trim()) ||
    Boolean(call.outcome_recorded_at);
  const hasCallTranscriptContext = Boolean(call.transcript?.trim());

  if (isCallSessionGeneration) {
    console.log("[askbob-after-call-call-session-context]", {
      workspaceId: workspace.id,
      jobId: job.id,
      callId: call.id,
      hasOutcome,
      hasReachedFlag,
      hasAutomatedCallNotesContext,
      hasCallTranscriptContext,
      hasLatestCallOutcomeContext,
    });
  }

  const customerRecord = Array.isArray(job.customers)
    ? job.customers[0] ?? null
    : job.customers ?? null;
  const customerName = customerRecord?.name?.trim() ?? null;

  const callStartedAt = call.started_at ?? call.created_at ?? null;
  const callEndedAt = estimateCallEnd(callStartedAt, call.duration_seconds);
  const existingCallSummary =
    call.ai_summary?.trim() || call.summary?.trim() || null;
  const phoneNumber = selectCallPhoneNumber(call);
  const callOutcome = mapCallOutcome(call);
  const recentJobSignals = await buildRecentJobSignals(supabase, workspace.id, job.id);
  const latestCallOutcome: LatestCallOutcomeForJob = {
    callId: call.id,
    occurredAt: call.outcome_recorded_at ?? call.created_at ?? call.started_at ?? null,
    reachedCustomer: call.reached_customer ?? null,
    outcomeCode: (call.outcome_code as LatestCallOutcomeForJob["outcomeCode"]) ?? null,
    outcomeNotes: normalizeCallOutcomeNotes(call.outcome_notes),
    isAskBobAssisted: isAskBobScriptSummary(call.ai_summary ?? call.summary ?? null),
  };

  console.log("[askbob-after-call-ui-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    callId: call.id,
    hasCallId: Boolean(parsed.callId),
    callOutcome,
    generationSource,
    hasLatestCallOutcomeContext,
    hasAutomatedCallNotesContext,
    hasCallTranscriptContext,
  });

  console.log("[askbob-after-call-generate-request]", {
    workspaceId: workspace.id,
    jobId: job.id,
    callId: call.id,
    generationSource,
    hasLatestCallOutcomeContext,
    hasAutomatedCallNotesContext,
    hasCallTranscriptContext,
  });

  let callHistoryRecords: CallHistoryRecord[] = [];
  try {
    callHistoryRecords = await loadCallHistoryForJob(supabase, workspace.id, job.id);
  } catch (error) {
    console.error("[askbob-after-call-ui] failed to load call history signals", error);
  }
  const callSummarySignals = computeCallSummarySignals(callHistoryRecords);

  const afterCallInput: AskBobJobAfterCallInput = {
    task: "job.after_call",
    context: {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      customerId: job.customer_id ?? null,
    },
    jobTitle: job.title?.trim() || null,
    jobDescription: job.description_raw?.trim() || null,
    callId: call.id,
    callOutcome,
    callDurationSeconds: call.duration_seconds ?? null,
    callStartedAt,
    callEndedAt,
    callerName: customerName,
    customerName,
    phoneNumber,
    existingCallSummary,
    recentJobSignals,
    callSummarySignals,
    latestCallOutcome,
    automatedCallNotes: normalizedAutomatedCallNotes,
  };

  try {
    const result = await runAskBobTask(supabase, afterCallInput);
    console.log("[askbob-after-call-ui-success]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      callId: call.id,
      callOutcome,
      generationSource,
      suggestedChannel: result.suggestedChannel,
      urgencyLevel: result.urgencyLevel,
      hasAutomatedCallNotesContext,
      hasLatestCallOutcomeContext,
      hasCallTranscriptContext,
    });
    return { ok: true, jobId: job.id, callId: call.id, result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-after-call-ui-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      callId: call.id,
      callOutcome,
      generationSource,
      hasLatestCallOutcomeContext,
      hasAutomatedCallNotesContext,
      hasCallTranscriptContext,
      errorMessage: truncatedError,
    });
    return { ok: false, code: "askbob_task_failed", message: truncatedError, jobId: job.id };
  }
}

async function loadCallForJob(
  supabase: ReturnType<typeof createServerClient>,
  payload: AfterCallPayload,
  workspaceId: string
): Promise<CallRow | null> {
  if (payload.callId) {
    const { data, error } = await supabase
      .from<CallRow>("calls")
      .select(
        "id, job_id, workspace_id, status, outcome, duration_seconds, started_at, summary, ai_summary, direction, from_number, to_number, created_at, outcome_code, outcome_notes, outcome_recorded_at, reached_customer, transcript, twilio_call_sid, twilio_status, twilio_status_updated_at, twilio_recording_url, twilio_recording_sid, twilio_recording_duration_seconds, twilio_recording_received_at"
      )
      .eq("workspace_id", workspaceId)
      .eq("job_id", payload.jobId)
      .eq("id", payload.callId)
      .maybeSingle();
    if (error) {
      console.error("[askbob-after-call-ui] call lookup failed", { error });
      return null;
    }
    if (data) {
      return data;
    }
  }

  try {
    const { data, error } = await supabase
      .from<CallRow>("calls")
      .select(
        "id, job_id, workspace_id, status, outcome, duration_seconds, started_at, summary, ai_summary, direction, from_number, to_number, created_at, outcome_code, outcome_notes, outcome_recorded_at, reached_customer, transcript, twilio_call_sid, twilio_status, twilio_status_updated_at, twilio_recording_url, twilio_recording_sid, twilio_recording_duration_seconds, twilio_recording_received_at"
      )
      .eq("workspace_id", workspaceId)
      .eq("job_id", payload.jobId)
      .order("started_at", { ascending: false })
      .range(0, 0)
      .maybeSingle();
    if (error) {
      console.error("[askbob-after-call-ui] latest call lookup failed", { error });
      return null;
    }
    return data ?? null;
  } catch (error) {
    console.error("[askbob-after-call-ui] failed fetching latest call", error);
    return null;
  }
}

function estimateCallEnd(startedAt: string | null, durationSeconds: number | null) {
  if (!startedAt || durationSeconds == null) {
    return null;
  }
  const startDate = new Date(startedAt);
  if (Number.isNaN(startDate.getTime())) {
    return null;
  }
  const end = new Date(startDate.getTime() + durationSeconds * 1000);
  return end.toISOString();
}

function selectCallPhoneNumber(call: CallRow) {
  const outbound = call.direction === "outbound";
  const primary = outbound ? call.to_number : call.from_number;
  const fallback = outbound ? call.from_number : call.to_number;
  return (primary?.trim() || fallback?.trim() || null) ?? null;
}

function mapCallOutcome(call: CallRow) {
  const outcome = call.outcome?.trim().toLowerCase();
  if (outcome) {
    if (["no_answer", "missed"].includes(outcome)) return "no_answer";
    if (["left_voicemail"].includes(outcome)) return "voicemail";
    if (["connected_scheduled", "connected_not_ready"].includes(outcome)) return "answered";
    if (["wrong_number"].includes(outcome)) return "wrong_number";
    return outcome;
  }
  const status = call.status?.trim().toLowerCase();
  if (status === "completed") return "answered";
  if (status === "missed" || status === "no_answer") return "no_answer";
  if (status === "voicemail") return "voicemail";
  return status ?? "unknown";
}

async function buildRecentJobSignals(
  supabase: ReturnType<typeof createServerClient>,
  workspaceId: string,
  jobId: string
): Promise<string | null> {
  const signals: string[] = [];
  try {
    const { data: quotes } = await supabase
      .from("quotes")
      .select("status, total, created_at")
      .eq("workspace_id", workspaceId)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1);
    const latestQuote = quotes?.[0] ?? null;
    if (latestQuote) {
      const timestamp = latestQuote.created_at
        ? formatFriendlyDateTime(latestQuote.created_at, "")
        : null;
      const amount = latestQuote.total != null ? `${latestQuote.total}` : null;
      signals.push(
        `Last quote ${latestQuote.status ?? "unknown"}${amount ? ` total ${amount}` : ""}${
          timestamp ? ` on ${timestamp}` : ""
        }`,
      );
    }
  } catch (error) {
    console.error("[askbob-after-call-ui] failed to load quote signals", error);
  }

  try {
    const { data: invoices } = await supabase
      .from("invoices")
      .select("status, due_at, total")
      .eq("workspace_id", workspaceId)
      .eq("job_id", jobId)
      .order("due_at", { ascending: false })
      .limit(1);
    const latestInvoice = invoices?.[0] ?? null;
    if (latestInvoice && latestInvoice.due_at) {
      const dueLabel = formatFriendlyDateTime(latestInvoice.due_at, "");
      signals.push(
        `Last invoice ${latestInvoice.status ?? "unknown"}${latestInvoice.total != null ? ` $${latestInvoice.total}` : ""}${
          dueLabel ? ` due ${dueLabel}` : ""
        }`,
      );
    }
  } catch (error) {
    console.error("[askbob-after-call-ui] failed to load invoice signals", error);
  }

  try {
    const nowIso = new Date().toISOString();
    const { data: appointments } = await supabase
      .from("appointments")
      .select("start_time, status, title")
      .eq("workspace_id", workspaceId)
      .eq("job_id", jobId)
      .gte("start_time", nowIso)
      .order("start_time", { ascending: true })
      .limit(1);
    const nextAppointment = appointments?.[0] ?? null;
    if (nextAppointment && nextAppointment.start_time) {
      const title = nextAppointment.title?.trim() ? ` for ${nextAppointment.title.trim()}` : "";
      const startLabel = formatFriendlyDateTime(nextAppointment.start_time, "");
      signals.push(
        `Next appointment${title}${startLabel ? ` on ${startLabel}` : ""}${
          nextAppointment.status ? ` (${nextAppointment.status})` : ""
        }`,
      );
    }
  } catch (error) {
    console.error("[askbob-after-call-ui] failed to load appointment signals", error);
  }

  if (!signals.length) {
    return null;
  }
  return signals.join(" · ");
}
