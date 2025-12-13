"use server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { runAskBobTask } from "@/lib/domain/askbob/service";
import type { CallHistoryRecord } from "@/lib/domain/askbob/callHistory";
import {
  loadCallHistoryForJob,
  computeCallSummarySignals,
} from "@/lib/domain/askbob/callHistory";
import { AskBobJobFollowupInput } from "@/lib/domain/askbob/types";
import { computeFollowupDueInfo, FollowupDueStatus } from "@/lib/domain/communications/followupRecommendations";
import { z } from "zod";
import { buildCallOutcomePromptContext } from "@/lib/domain/calls/latestCallOutcome";

const normalizeOptionalString = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const jobFollowupPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  extraDetails: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable().transform(normalizeOptionalString),
  jobDescription: z.string().optional().nullable().transform(normalizeOptionalString),
  diagnosisSummary: z.string().optional().nullable().transform(normalizeOptionalString),
  materialsSummary: z.string().optional().nullable().transform(normalizeOptionalString),
  hasQuoteContextForFollowup: z.boolean().optional(),
  hasAskBobAppointment: z.boolean().optional(),
  latestCallOutcome: z
    .object({
      callId: z.string().min(1),
      occurredAt: z.string().optional().nullable(),
      reachedCustomer: z.boolean().nullable(),
      outcomeCode: z.string().nullable(),
      outcomeNotes: z.string().nullable(),
      isAskBobAssisted: z.boolean(),
      displayLabel: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  latestCallOutcomeContext: z.string().optional().nullable(),
});

export type JobFollowupPayload = z.infer<typeof jobFollowupPayloadSchema>;

function mapFollowupDueStatus(status: FollowupDueStatus): AskBobJobFollowupInput["followupDueStatus"] {
  if (status === "overdue") {
    return "overdue";
  }
  if (status === "due-today") {
    return "due";
  }
  if (status === "scheduled") {
    return "upcoming";
  }
  return "none";
}

export async function runAskBobJobFollowupAction(payload: JobFollowupPayload) {
  const parsed = jobFollowupPayloadSchema.parse(payload);
  const normalizedJobTitle = parsed.jobTitle ?? null;
  const diagnosisSummaryForLog = parsed.diagnosisSummary ?? null;
  const materialsSummaryForLog = parsed.materialsSummary ?? null;
  const hasDiagnosisContextForFollowup = Boolean(diagnosisSummaryForLog);
  const hasMaterialsContextForFollowup = Boolean(materialsSummaryForLog);
  const hasAskBobAppointment = Boolean(parsed.hasAskBobAppointment);
  const latestCallOutcome = parsed.latestCallOutcome ?? null;
  const latestCallOutcomeContext =
    parsed.latestCallOutcomeContext?.trim() ||
    buildCallOutcomePromptContext(latestCallOutcome);
  const hasLatestCallOutcome = Boolean(latestCallOutcome);
  const hasLatestCallOutcomeCode = Boolean(latestCallOutcome?.outcomeCode);

  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    return { ok: false, error: "workspace_unavailable" };
  }

  if (workspace.id !== parsed.workspaceId) {
    console.error("[askbob-job-followup-ui-failure] workspace mismatch", {
      expectedWorkspaceId: workspace.id,
      payloadWorkspaceId: parsed.workspaceId,
      userId: user.id,
      jobId: parsed.jobId,
    });
    return { ok: false, error: "wrong_workspace" };
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, workspace_id, status, customer_id, description_raw")
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.jobId)
    .maybeSingle();

  if (!job) {
    console.error("[askbob-job-followup-ui-failure] job not found", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: parsed.jobId,
    });
    return { ok: false, error: "job_not_found" };
  }

  let callHistoryRecords: CallHistoryRecord[] = [];
  try {
    callHistoryRecords = await loadCallHistoryForJob(supabase, workspace.id, job.id);
  } catch (error) {
    console.error("[askbob-job-followup-ui] failed to load call history signals", error);
  }
  const callSummarySignals = computeCallSummarySignals(callHistoryRecords);

  const [messageRes, quoteRes, invoiceRes, appointmentRes] = await Promise.all([
    supabase
      .from("messages")
      .select("id, created_at, sent_at")
      .eq("workspace_id", workspace.id)
      .eq("job_id", job.id)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("quotes")
      .select("id, status, created_at, total")
      .eq("workspace_id", workspace.id)
      .eq("job_id", job.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("invoices")
      .select("id, status, due_at, created_at")
      .eq("workspace_id", workspace.id)
      .eq("job_id", job.id)
      .order("due_at", { ascending: false, nulls: "last" })
      .limit(5),
    supabase
      .from("appointments")
      .select("id, start_time, status")
      .eq("workspace_id", workspace.id)
      .eq("job_id", job.id)
      .order("start_time", { ascending: false })
      .limit(20),
  ]);

  const latestCall = callHistoryRecords[0] ?? null;
  const latestMessage = messageRes.data?.[0] ?? null;
  const quotesList = quoteRes.data ?? [];
  const latestQuote = quotesList.find((quote) => Boolean(quote.created_at)) ?? null;
  const latestInvoice =
    invoiceRes.data?.find((invoice) => Boolean(invoice.due_at)) ??
    invoiceRes.data?.[0] ??
    null;
  const appointments = appointmentRes.data ?? [];

  const lastCallAt = latestCall?.started_at ?? latestCall?.created_at ?? null;
  const lastMessageAt = latestMessage?.sent_at ?? latestMessage?.created_at ?? null;
  const lastQuoteAt = latestQuote?.created_at ?? null;
  const lastInvoiceDueAt = latestInvoice?.due_at ?? null;

  const hasOpenQuote =
    quotesList.some(
      (quote) => quote.status && !["accepted", "paid"].includes(quote.status),
    ) && Boolean(quoteRes.data?.length);
  const hasQuoteContextForFollowup = quotesList.length > 0;
  const hasUnpaidInvoice =
    (invoiceRes.data ?? []).some((invoice) => invoice.status !== "paid" && Boolean(invoice.id)) &&
    Boolean(invoiceRes.data?.length);

  const hasScheduledVisit = appointments.some((appt) => {
    if (!appt.start_time) return false;
    const start = new Date(appt.start_time);
    if (Number.isNaN(start.getTime())) return false;
    if (appt.status && appt.status.toLowerCase() === "cancelled") return false;
    return start.getTime() >= Date.now();
  });

  const followupDueInfo = computeFollowupDueInfo({
    quoteCreatedAt: lastQuoteAt,
    callCreatedAt: lastCallAt,
    invoiceDueAt: lastInvoiceDueAt,
    recommendedDelayDays: null,
  });

  console.log("[askbob-job-followup-ui-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    jobStatus: job.status ?? null,
    followupDueStatus: followupDueInfo.dueStatus,
    hasOpenQuote,
    hasUnpaidInvoice,
    hasJobTitle: Boolean(normalizedJobTitle || job.title?.trim()),
    hasDiagnosisContextForFollowup,
    hasMaterialsContextForFollowup,
    hasQuoteContextForFollowup,
    hasAskBobAppointment,
    hasLatestCallOutcome,
    hasLatestCallOutcomeCode,
    outcomeCode: latestCallOutcome?.outcomeCode ?? null,
  });

  const notesSummary =
    typeof job.description_raw === "string" && job.description_raw.trim()
      ? job.description_raw.trim().slice(0, 400)
      : null;

  const jobTitleForInput = normalizedJobTitle ?? job.title?.trim() ?? null;
  const followupInput: AskBobJobFollowupInput = {
    task: "job.followup",
    context: {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      customerId: job.customer_id ?? null,
    },
    jobTitle: jobTitleForInput,
    jobStatus: job.status ?? "open",
    hasScheduledVisit,
    lastMessageAt,
    lastCallAt,
    lastQuoteAt,
    lastInvoiceDueAt,
    followupDueStatus: mapFollowupDueStatus(followupDueInfo.dueStatus),
    followupDueLabel: followupDueInfo.dueLabel,
    recommendedDelayDays: followupDueInfo.recommendedDelayDays,
    hasOpenQuote,
    hasUnpaidInvoice,
    notesSummary,
    callSummarySignals,
    latestCallOutcome,
    latestCallOutcomeContext,
    hasQuoteContextForFollowup,
    hasAskBobAppointment,
  };

  try {
    const result = await runAskBobTask(supabase, followupInput);
    console.log("[askbob-job-followup-ui-success]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      followupDueStatus: followupInput.followupDueStatus,
      modelLatencyMs: result.modelLatencyMs,
      stepsCount: result.steps.length,
      shouldSendMessage: result.shouldSendMessage,
      shouldScheduleVisit: result.shouldScheduleVisit,
      shouldCall: result.shouldCall,
      shouldWait: result.shouldWait,
      hasDiagnosisContextForFollowup,
      hasMaterialsContextForFollowup,
      hasQuoteContextForFollowup,
      hasAskBobAppointment,
      hasLatestCallOutcome,
      hasLatestCallOutcomeCode,
    });
    return { ok: true, jobId: job.id, followup: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-job-followup-ui-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      errorMessage: truncatedError,
    });
    return { ok: false, error: "askbob_job_followup_failed" };
  }
}
