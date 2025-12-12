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

const afterCallPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  callId: z.string().min(1).optional().nullable(),
});

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
};

export async function runAskBobJobAfterCallAction(payload: AfterCallPayload): Promise<AfterCallActionResult> {
  const parsed = afterCallPayloadSchema.parse(payload);
  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    return { ok: false, code: "workspace_unavailable" };
  }

  if (workspace.id !== parsed.workspaceId) {
    console.error("[askbob-after-call-ui-failure] workspace mismatch", {
      expectedWorkspaceId: workspace.id,
      payloadWorkspaceId: parsed.workspaceId,
      userId: user.id,
      jobId: parsed.jobId,
    });
    return { ok: false, code: "wrong_workspace" };
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

  console.log("[askbob-after-call-ui-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    callId: call.id,
    hasCallId: Boolean(parsed.callId),
    callOutcome,
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
  };

  try {
    const result = await runAskBobTask(supabase, afterCallInput);
    console.log("[askbob-after-call-ui-success]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      callId: call.id,
      callOutcome,
      suggestedChannel: result.suggestedChannel,
      urgencyLevel: result.urgencyLevel,
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
        "id, job_id, workspace_id, status, outcome, duration_seconds, started_at, summary, ai_summary, direction, from_number, to_number, created_at"
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
        "id, job_id, workspace_id, status, outcome, duration_seconds, started_at, summary, ai_summary, direction, from_number, to_number, created_at"
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
