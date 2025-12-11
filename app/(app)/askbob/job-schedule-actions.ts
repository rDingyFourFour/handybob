"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { formatFriendlyDateTime } from "@/utils/timeline/formatters";
import {
  runAskBobTask,
  recordAskBobJobTaskSnapshot,
} from "@/lib/domain/askbob/service";
import {
  AskBobJobScheduleInput,
  AskBobJobScheduleSuggestion,
  AskBobJobScheduleSnapshotPayload,
} from "@/lib/domain/askbob/types";
import {
  computeFollowupDueInfo,
  FollowupDueStatus,
} from "@/lib/domain/communications/followupRecommendations";

const DEFAULT_WORKING_HOURS = {
  startAt: "08:00",
  endAt: "17:00",
};

const jobSchedulePayloadSchema = z.object({
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  preferredDays: z.array(z.string()).optional().nullable(),
  preferredStartAt: z.string().optional().nullable(),
  preferredEndAt: z.string().optional().nullable(),
});

type JobSchedulePayload = z.infer<typeof jobSchedulePayloadSchema>;

type JobScheduleSuccessResult = {
  ok: true;
  jobId: string;
  suggestions: AskBobJobScheduleSuggestion[];
  explanation?: string | null;
  modelLatencyMs: number;
};

type JobScheduleFailureResult = { ok: false; error: string; jobId?: string };

type JobScheduleActionResult = JobScheduleSuccessResult | JobScheduleFailureResult;

function mapFollowupDueStatus(status: FollowupDueStatus): AskBobJobScheduleInput["followupDueStatus"] {
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

function normalizeDays(days?: string[] | null): string[] | undefined {
  if (!Array.isArray(days)) {
    return undefined;
  }
  const normalized = days
    .map((day) => (typeof day === "string" ? day.trim() : ""))
    .filter(Boolean);
  return normalized.length ? normalized : undefined;
}

function normalizeTime(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function buildNotesSummary(description?: string | null): string | null {
  if (!description) {
    return null;
  }
  const trimmed = description.trim();
  if (!trimmed.length) {
    return null;
  }
  return trimmed.length <= 400 ? trimmed : trimmed.slice(0, 400);
}

const DEFAULT_PREFERRED_WINDOW = {
  startAt: DEFAULT_WORKING_HOURS.startAt,
  endAt: DEFAULT_WORKING_HOURS.endAt,
};

export async function runAskBobJobScheduleAction(
  payload: JobSchedulePayload
): Promise<JobScheduleActionResult> {
  const parsed = jobSchedulePayloadSchema.parse(payload);
  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    return { ok: false, error: "workspace_unavailable" };
  }

  if (workspace.id !== parsed.workspaceId) {
    console.error("[askbob-job-schedule-ui-failure] workspace mismatch", {
      expectedWorkspaceId: workspace.id,
      payloadWorkspaceId: parsed.workspaceId,
      userId: user.id,
      jobId: parsed.jobId,
    });
    return { ok: false, error: "wrong_workspace" };
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, workspace_id, status, customer_id, description_raw, title")
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.jobId)
    .maybeSingle();

  if (!job) {
    console.error("[askbob-job-schedule-ui-failure] job not found", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: parsed.jobId,
    });
    return { ok: false, error: "job_not_found" };
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
  const quotesList = quoteRes.data ?? [];
  const latestQuote = quotesList.find((quote) => Boolean(quote.created_at)) ?? null;
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
    quotesList.some(
      (quote) => quote.status && !["accepted", "paid"].includes(quote.status),
    ) && Boolean(quotesList.length);
  const hasQuoteContext = quotesList.length > 0;
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

  const preferredDays = normalizeDays(parsed.preferredDays);
  const preferredStartAt = normalizeTime(parsed.preferredStartAt);
  const preferredEndAt = normalizeTime(parsed.preferredEndAt);
  const workingHours = {
    startAt: preferredStartAt ?? DEFAULT_PREFERRED_WINDOW.startAt,
    endAt: preferredEndAt ?? DEFAULT_PREFERRED_WINDOW.endAt,
  };

  console.log("[askbob-job-schedule-ui-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    followupDueStatus: followupDueInfo.dueStatus,
    hasOpenQuote,
    hasQuoteContext,
    hasUnpaidInvoice,
    hasScheduledVisit,
    lastMessageAt,
    preferredDaysCount: preferredDays?.length ?? 0,
    hasPreferredWindow: Boolean(preferredStartAt || preferredEndAt),
    isAskBobScheduler: true,
    task: "job.scheduler",
  });

  const jobDescription = buildNotesSummary(job.description_raw ?? null);
  const scheduleInput: AskBobJobScheduleInput = {
    task: "job.schedule",
    context: {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      customerId: job.customer_id ?? null,
    },
    jobTitle: job.title ? job.title.trim() : null,
    jobDescription,
    followupDueStatus: mapFollowupDueStatus(followupDueInfo.dueStatus),
    followupDueLabel: followupDueInfo.dueLabel,
    hasVisitScheduled: hasScheduledVisit,
    hasQuote: Boolean(quotesList.length),
    hasInvoice: hasUnpaidInvoice,
    notesSummary: jobDescription,
    availability: {
      workingHours,
      preferredDays,
      timezone: null,
    },
  };

  try {
    const result = await runAskBobTask(supabase, scheduleInput);
    const suggestionsCount = result.suggestions.length;
    const reason = suggestionsCount ? "suggestions" : "no_suggestions";
    console.log("[askbob-job-schedule-ui-success]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      followupDueStatus: followupDueInfo.dueStatus,
      suggestionsCount,
      modelLatencyMs: result.modelLatencyMs,
      reason,
      hasPreferredDays: Boolean(preferredDays?.length),
      isAskBobScheduler: true,
      task: "job.scheduler",
    });

    const explanation =
      result.explanation ?? (suggestionsCount ? null : "Need more information to propose a time.");
    return {
      ok: true,
      jobId: job.id,
      suggestions: result.suggestions,
      explanation,
      modelLatencyMs: result.modelLatencyMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-job-schedule-ui-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      errorMessage: truncatedError,
      isAskBobScheduler: true,
      task: "job.scheduler",
    });
    return { ok: false, error: "askbob_job_schedule_failed", jobId: job.id };
  }
}

const appointmentSchedulePayloadSchema = z.object({
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  startAt: z.string().min(1),
  endAt: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
});

type AppointmentSchedulePayload = z.infer<typeof appointmentSchedulePayloadSchema>;

type AppointmentScheduleSuccessResult = {
  ok: true;
  appointmentId: string;
  startAt: string;
  endAt: string;
  title: string;
};
type AppointmentScheduleFailureResult = { ok: false; error: string; jobId?: string };
type AppointmentScheduleActionResult =
  | AppointmentScheduleSuccessResult
  | AppointmentScheduleFailureResult;

export async function runAskBobScheduleAppointmentAction(
  payload: AppointmentSchedulePayload
): Promise<AppointmentScheduleActionResult> {
  const parsed = appointmentSchedulePayloadSchema.parse(payload);
  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    return { ok: false, error: "workspace_unavailable" };
  }

  if (workspace.id !== parsed.workspaceId) {
    console.error("[askbob-job-schedule-appointment-ui-failure] workspace mismatch", {
      expectedWorkspaceId: workspace.id,
      payloadWorkspaceId: parsed.workspaceId,
      userId: user.id,
      jobId: parsed.jobId,
      isAskBobScheduler: true,
      task: "job.scheduler",
    });
    return { ok: false, error: "wrong_workspace" };
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.jobId)
    .maybeSingle();

  if (!job) {
    console.error("[askbob-job-schedule-appointment-ui-failure] job not found", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: parsed.jobId,
      isAskBobScheduler: true,
      task: "job.scheduler",
    });
    return { ok: false, error: "job_not_found" };
  }

  const startDate = new Date(parsed.startAt);
  if (Number.isNaN(startDate.getTime())) {
    return { ok: false, error: "invalid_start_time" };
  }

  let endTimeIso: string | null = null;
  if (parsed.endAt) {
    const endDate = new Date(parsed.endAt);
    if (!Number.isNaN(endDate.getTime())) {
      endTimeIso = endDate.toISOString();
    }
  }
  if (!endTimeIso) {
    const fallbackEnd = new Date(startDate);
    fallbackEnd.setMinutes(fallbackEnd.getMinutes() + 60);
    endTimeIso = fallbackEnd.toISOString();
  }

  const title =
    parsed.title?.trim() ||
    (job.title ? `Visit ${job.title.trim()}` : "Visit");

  const insertPayload = {
    user_id: user.id,
    workspace_id: workspace.id,
    job_id: job.id,
    title,
    status: "scheduled",
    notes: "",
    location: "",
    start_time: startDate.toISOString(),
    end_time: endTimeIso,
  };

  console.log("[askbob-job-schedule-appointment-ui-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    startAt: startDate.toISOString(),
    endAt: endTimeIso,
    title,
    insertPayload,
    isAskBobScheduler: true,
    task: "job.scheduler",
  });

  const { data, error } = await supabase
    .from("appointments")
    .insert(insertPayload)
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    console.error("[askbob-job-schedule-appointment-ui] Failed to create appointment", {
      error,
      payload: insertPayload,
      isAskBobScheduler: true,
      task: "job.scheduler",
    });
    return { ok: false, error: "create_failed", jobId: job.id };
  }

  const appointmentId = data.id;
  const startIso = startDate.toISOString();
  console.log("[askbob-job-schedule-appointment-ui-success]", {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    appointmentId,
    startAt: startIso,
    endAt: endTimeIso,
    title,
    isAskBobScheduler: true,
    task: "job.scheduler",
  });
  const friendlyLabelCandidate = formatFriendlyDateTime(startIso, "");
  const friendlyLabel =
    friendlyLabelCandidate?.trim() && friendlyLabelCandidate.length ? friendlyLabelCandidate : null;
  const snapshotPayload: AskBobJobScheduleSnapshotPayload = {
    appointmentId,
    startAt: startIso,
    endAt: endTimeIso,
    friendlyLabel,
  };
  try {
    await recordAskBobJobTaskSnapshot(supabase, {
      workspaceId: workspace.id,
      jobId: job.id,
      task: "job.schedule",
      result: snapshotPayload,
    });
  } catch (snapshotError) {
    console.error("[askbob-job-schedule-appointment-ui] Failed to record appointment snapshot", snapshotError);
  }

  revalidatePath("/appointments");
  revalidatePath(`/jobs/${job.id}`);

  return {
    ok: true,
    appointmentId,
    startAt: startIso,
    endAt: endTimeIso,
    title,
  };
}
