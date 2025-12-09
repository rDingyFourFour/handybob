"use server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { runAskBobTask } from "@/lib/domain/askbob/service";
import type {
  AskBobMessageDraftInput,
  AskBobMessageDraftResult,
  AskBobTaskContext,
} from "@/lib/domain/askbob/types";
import { computeFollowupDueInfo, FollowupDueStatus } from "@/lib/domain/communications/followupRecommendations";
import { z } from "zod";

const followupMessageDraftPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  extraDetails: z.string().optional().nullable(),
});

export type DraftAskBobJobFollowupMessageResult =
  | {
      ok: true;
      jobId: string;
      customerId: string;
      body: string;
      meta: {
        suggestedChannel?: string | null;
        summary?: string | null;
        modelLatencyMs: number;
        followupDueStatus: FollowupDueStatus;
        followupDueLabel: string;
        hasOpenQuote: boolean;
        hasUnpaidInvoice: boolean;
        hasScheduledVisit: boolean;
      };
    }
  | { ok: false; code: string };

export async function draftAskBobJobFollowupMessageAction(
  rawInput: unknown
): Promise<DraftAskBobJobFollowupMessageResult> {
  const payload = followupMessageDraftPayloadSchema.parse(rawInput);

  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    console.error("[askbob-job-followup-message-draft-failure] workspace unavailable");
    return { ok: false, code: "workspace_unavailable" };
  }

  if (workspace.id !== payload.workspaceId) {
    console.error("[askbob-job-followup-message-draft-failure] wrong workspace", {
      payloadWorkspaceId: payload.workspaceId,
      workspaceId: workspace.id,
      userId: user.id,
    });
    return { ok: false, code: "wrong_workspace" };
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, workspace_id, title, status, customer_id, description_raw")
    .eq("workspace_id", workspace.id)
    .eq("id", payload.jobId)
    .maybeSingle();

  if (!job) {
    console.error("[askbob-job-followup-message-draft-failure] job not found", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: payload.jobId,
    });
    return { ok: false, code: "job_not_found" };
  }

  if (!job.customer_id) {
    console.error("[askbob-job-followup-message-draft-failure] job missing customer", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
    });
    return { ok: false, code: "no_customer_for_job" };
  }

  const [callRes, messageRes, quoteRes, invoiceRes, appointmentRes] = await Promise.all([
    supabase
      .from("calls")
      .select("id, started_at")
      .eq("workspace_id", workspace.id)
      .eq("job_id", job.id)
      .order("started_at", { ascending: false })
      .limit(1),
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

  const latestCall = callRes.data?.[0] ?? null;
  const latestMessage = messageRes.data?.[0] ?? null;
  const latestQuote = quoteRes.data?.find((quote) => Boolean(quote.created_at)) ?? null;
  const latestInvoice =
    invoiceRes.data?.find((invoice) => Boolean(invoice.due_at)) ??
    invoiceRes.data?.[0] ??
    null;
  const appointments = appointmentRes.data ?? [];

  const lastCallAt = latestCall?.started_at ?? null;
  const lastMessageAt = latestMessage?.sent_at ?? latestMessage?.created_at ?? null;
  const lastQuoteAt = latestQuote?.created_at ?? null;
  const lastInvoiceDueAt = latestInvoice?.due_at ?? null;

  const hasOpenQuote =
    (quoteRes.data ?? []).some(
      (quote) => quote.status && !["accepted", "paid"].includes(quote.status),
    ) && Boolean(quoteRes.data?.length);
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

  const trimmedExtraDetails = payload.extraDetails?.trim();
  console.log("[askbob-job-followup-message-draft-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    customerId: job.customer_id,
    followupDueStatus: followupDueInfo.dueStatus,
    hasOpenQuote,
    hasUnpaidInvoice,
    hasScheduledVisit,
    hasExtraDetails: Boolean(trimmedExtraDetails),
  });

  const summaryFragments: string[] = [];
  const jobTitle = job.title?.trim() || "Untitled job";
  summaryFragments.push(`Job: ${jobTitle}`);
  if (job.status) {
    summaryFragments.push(`Status: ${job.status}`);
  }
  if (followupDueInfo.dueLabel) {
    summaryFragments.push(`Follow-up status: ${followupDueInfo.dueLabel}`);
  }
  if (hasOpenQuote) {
    summaryFragments.push("There is at least one open quote.");
  }
  if (hasUnpaidInvoice) {
    summaryFragments.push("The customer has an unpaid invoice.");
  }
  if (hasScheduledVisit) {
    summaryFragments.push("A visit is already scheduled.");
  }
  if (job.description_raw?.trim()) {
    summaryFragments.push(`Details: ${job.description_raw.trim().slice(0, 400)}`);
  }
  if (lastCallAt) {
    summaryFragments.push(`Last call: ${new Date(lastCallAt).toISOString()}`);
  }
  if (lastMessageAt) {
    summaryFragments.push(`Last message: ${new Date(lastMessageAt).toISOString()}`);
  }
  if (trimmedExtraDetails) {
    summaryFragments.push(`Technician notes: ${trimmedExtraDetails}`);
  }

  const extraDetails = summaryFragments.join("\n\n");

  const context: AskBobTaskContext = {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    customerId: job.customer_id,
  };

  const taskInput: AskBobMessageDraftInput = {
    task: "message.draft",
    context,
    purpose:
      "Draft a short, friendly follow-up message for this job. The message should check in, confirm next steps, and keep the job moving.",
    tone: "friendly",
    extraDetails: extraDetails || null,
  };

  try {
    const taskResult = (await runAskBobTask(
      supabase,
      taskInput,
    )) as AskBobMessageDraftResult;

    console.log("[askbob-job-followup-message-draft-success]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      customerId: job.customer_id,
      followupDueStatus: followupDueInfo.dueStatus,
      modelLatencyMs: taskResult.modelLatencyMs,
      bodyLength: taskResult.body.length,
      suggestedChannel: taskResult.suggestedChannel ?? null,
    });

    return {
      ok: true,
      jobId: job.id,
      customerId: job.customer_id,
      body: taskResult.body,
      meta: {
        suggestedChannel: taskResult.suggestedChannel ?? null,
        summary: taskResult.summary ?? null,
        modelLatencyMs: taskResult.modelLatencyMs,
        followupDueStatus: followupDueInfo.dueStatus,
        followupDueLabel: followupDueInfo.dueLabel,
        hasOpenQuote,
        hasUnpaidInvoice,
        hasScheduledVisit,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
    const truncated = message.length <= 200 ? message : `${message.slice(0, 197)}...`;
    console.error("[askbob-job-followup-message-draft-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      customerId: job.customer_id,
      errorMessage: truncated,
    });
    return { ok: false, code: "askbob_job_followup_message_draft_failed" };
  }
}
