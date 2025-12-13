export const dynamic = "force-dynamic";

import type { ReactNode } from "react";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import { formatCurrency, formatFriendlyDateTime } from "@/utils/timeline/formatters";
import {
  getJobAskBobHudSummary,
  getJobAskBobSnapshotsForJob,
} from "@/lib/domain/askbob/service";
import JobDetailsCard from "@/components/JobDetailsCard";
import {
  computeFollowupDueInfo,
  type FollowupDueStatus,
  type FollowupDueInfo,
} from "@/lib/domain/communications/followupRecommendations";
import JobAskBobFlow from "@/components/askbob/JobAskBobFlow";
import JobQuotesCard from "@/components/jobs/JobQuotesCard";
import JobRecentActivityCard from "@/components/jobs/JobRecentActivityCard";
import {
  loadCallHistoryForJob,
  computeCallSummarySignals,
  describeCallOutcome,
  type CallSummarySignals,
} from "@/lib/domain/askbob/callHistory";
import { getLatestCallOutcomeForJob } from "@/lib/domain/calls/latestCallOutcome";

type JobRecord = {
  id: string;
  title: string | null;
  status: string | null;
  urgency: string | null;
  source: string | null;
  ai_urgency: string | null;
  priority: string | null;
  attention_score: number | null;
  attention_reason: string | null;
  description_raw: string | null;
  created_at: string | null;
  customer_id: string | null;
  customers:
    | { id: string | null; name: string | null; phone?: string | null }
    | Array<{ id: string | null; name: string | null; phone?: string | null }>
    | null;
};

type JobQuoteSummary = {
  id: string;
  job_id: string | null;
  status: string | null;
  total: number | null;
  created_at: string | null;
  smart_quote_used: boolean | null;
};

type LatestCallRecord = {
  id: string;
  job_id: string | null;
  workspace_id: string | null;
  created_at: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  status: string | null;
  outcome: string | null;
  direction: string | null;
};

type JobAppointmentRow = {
  id: string;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
};

const appointmentStatusClasses: Record<string, string> = {
  scheduled: "border border-amber-500/40 bg-amber-500/10 text-amber-200",
  completed: "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  cancelled: "border border-rose-500/40 bg-rose-500/10 text-rose-200",
  canceled: "border border-rose-500/40 bg-rose-500/10 text-rose-200",
};

function appointmentStatusLabel(status: string | null) {
  if (!status) {
    return "Scheduled";
  }
  if (status === "cancelled" || status === "canceled") {
    return "Canceled";
  }
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function appointmentStatusClass(status: string | null) {
  if (!status) {
    return appointmentStatusClasses.scheduled;
  }
  return appointmentStatusClasses[status] ?? "border border-slate-700 bg-slate-900/60 text-slate-200";
}

function formatAppointmentTimeRange(start: string | null, end: string | null) {
  if (!start) {
    return "Time TBD";
  }
  const options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const startLabel = new Date(start).toLocaleTimeString(undefined, options);
  if (!end) {
    return startLabel;
  }
  const endLabel = new Date(end).toLocaleTimeString(undefined, options);
  return `${startLabel} — ${endLabel}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildCallLabel(call: LatestCallRecord | null): string | null {
  if (!call) {
    return null;
  }
  const when = call.started_at ?? call.created_at;
  const whenLabel = when ? formatFriendlyDateTime(when, "") : null;
  const outcome = friendlyCallOutcome(call);
  const duration = describeCallDuration(call.duration_seconds);
  const parts = [
    whenLabel ? `Call on ${whenLabel}` : null,
    outcome,
    duration,
  ].filter(Boolean);
  if (!parts.length) {
    return "Most recent call";
  }
  return parts.join(" · ");
}

function buildCallHistoryHint(signals: CallSummarySignals): string {
  const attemptPlural = signals.totalAttempts === 1 ? "attempt" : "attempts";
  const parts = [
    `${signals.totalAttempts} ${attemptPlural}`,
    `${signals.answeredCount} answered`,
    `${signals.voicemailCount} voicemail`,
  ];
  const outcomeLabel = describeCallOutcome(signals.lastOutcome);
  if (outcomeLabel) {
    parts.push(`last outcome ${outcomeLabel}`);
  }
  if (signals.lastAttemptAt) {
    const friendlyLastAttempt = formatFriendlyDateTime(signals.lastAttemptAt, "");
    if (friendlyLastAttempt) {
      parts.push(`last attempt ${friendlyLastAttempt}`);
    }
  }
  const windowLabel =
    signals.bestGuessRetryWindow && signals.bestGuessRetryWindow.trim()
      ? `Best retry window: ${signals.bestGuessRetryWindow}`
      : null;
  const baseHint = parts.join(" · ");
  return [baseHint, windowLabel].filter(Boolean).join(" · ");
}

function friendlyCallOutcome(call: LatestCallRecord): string | null {
  const raw = call.outcome?.replace(/_/g, " ") || call.status;
  if (!raw) {
    return null;
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function describeCallDuration(durationSeconds: number | null): string | null {
  if (durationSeconds == null) {
    return null;
  }
  if (durationSeconds >= 60) {
    const minutes = Math.round(durationSeconds / 60);
    return `${minutes} min`;
  }
  return `${durationSeconds} sec`;
}

function fallbackCard(title: string, body: string, action?: ReactNode) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{body}</p>
        {action}
      </HbCard>
    </div>
  );
}

function startOfToday(date?: Date) {
  const base = date ? new Date(date) : new Date();
  base.setHours(0, 0, 0, 0);
  base.setMilliseconds(0);
  return base;
}

function normalizeParam(value?: string | string[] | null) {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] : value;
}

function onlyStringParam(value?: string | string[] | null) {
  if (typeof value === "string") {
    return value;
  }
  return null;
}

export default async function JobDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined> | null>;
}) {
  const { id } = await props.params;
  // searchParams is delivered as a Promise in this route, so await it before using any fields.
  const searchParams: Record<string, string | string[] | undefined> =
    (await props.searchParams) ?? {};
  const afterCallCacheKey = normalizeParam(onlyStringParam(searchParams.afterCallKey ?? null));
  const afterCallCallId = normalizeParam(onlyStringParam(searchParams.callId ?? null));

  if (!id || !id.trim()) {
    notFound();
  }

  if (id === "new") {
    redirect("/jobs/new");
    return null;
  }

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[job-detail] Failed to init Supabase client", error);
    return fallbackCard("Job unavailable", "Could not connect to Supabase. Please try again.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
    return null;
  }

  let workspace;
  try {
    const workspaceResult = await getCurrentWorkspace({ supabase });
    workspace = workspaceResult.workspace;
  } catch (error) {
    console.error("[job-detail] Failed to resolve workspace", error);
    return fallbackCard("Job unavailable", "Unable to resolve workspace. Please try again.");
  }

  if (!workspace) {
    return fallbackCard("Job unavailable", "Unable to resolve workspace. Please try again.");
  }

  let job: JobRecord | null = null;

  try {
    const { data, error } = await supabase
      .from<JobRecord>("jobs")
      .select(
        `
          id,
          title,
          status,
          urgency,
          source,
          ai_urgency,
          priority,
          attention_score,
          attention_reason,
          description_raw,
          created_at,
          customer_id,
          customers(id, name, phone)
        `
      )
      .eq("workspace_id", workspace.id)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[job-detail] Job lookup failed", error);
      return fallbackCard("Job not found", "We couldn’t find that job. It may have been deleted.");
    }

    job = data ?? null;
  } catch (error) {
    console.error("[job-detail] Job query error", error);
    return fallbackCard("Job not found", "We couldn’t find that job. It may have been deleted.");
  }

  if (!job) {
    return fallbackCard("Job not found", "We couldn’t find that job. It may have been deleted.");
  }

  let askBobHudSummary: {
    lastTaskLabel: string | null;
    lastUsedAt: string | null;
    totalRunsCount: number;
    tasksSeen: string[];
  } = {
    lastTaskLabel: null,
    lastUsedAt: null,
    totalRunsCount: 0,
    tasksSeen: [],
  };
  try {
    askBobHudSummary = await getJobAskBobHudSummary(supabase, {
      workspaceId: workspace.id,
      jobId: job.id,
    });
  } catch (error) {
    console.error("[job-detail] Failed to load AskBob HUD summary", error);
  }
  const askBobLastTaskLabel = askBobHudSummary.lastTaskLabel;
  const askBobLastUsedAtIso = askBobHudSummary.lastUsedAt;
  const friendlyDate =
    askBobLastUsedAtIso ? formatFriendlyDateTime(askBobLastUsedAtIso, "") : null;
  const askBobLastUsedAtDisplay = friendlyDate?.trim() ? friendlyDate : null;
  let askBobRunsSummary: string | null = null;
  if (askBobHudSummary.totalRunsCount > 1) {
    const baseText = `${askBobHudSummary.totalRunsCount} AskBob runs`;
    const tasks = askBobHudSummary.tasksSeen;
    if (tasks.length > 0) {
      const visible = tasks.slice(0, 3);
      const remainder = tasks.length - visible.length;
      const suffix = remainder > 0 ? `, +${remainder} more` : "";
      askBobRunsSummary = `${baseText} (${visible.join(", ")}${suffix})`;
    } else {
      askBobRunsSummary = baseText;
    }
  }

  let askBobSnapshots = {
    diagnoseSnapshot: null,
    materialsSnapshot: null,
    quoteSnapshot: null,
    followupSnapshot: null,
    afterCallSnapshot: null,
  };
  try {
    askBobSnapshots = await getJobAskBobSnapshotsForJob(supabase, {
      workspaceId: workspace.id,
      jobId: job.id,
    });
  } catch (error) {
    console.error("[job-detail] Failed to load AskBob snapshots", error);
  }

  const {
    diagnoseSnapshot,
    materialsSnapshot,
    quoteSnapshot,
    followupSnapshot,
    afterCallSnapshot,
  } = askBobSnapshots;


  let upcomingAppointments: JobAppointmentRow[] = [];
  let upcomingAppointmentsError = false;
  try {
    const todayIso = startOfToday().toISOString();
    const { data, error } = await supabase
      .from<JobAppointmentRow>("appointments")
      .select("id, start_time, end_time, status")
      .eq("workspace_id", workspace.id)
      .eq("job_id", job.id)
      .gte("start_time", todayIso)
      .order("start_time", { ascending: true })
      .limit(5);

    if (error) {
      console.error("[job-detail] Failed to load upcoming appointments", error);
      upcomingAppointmentsError = true;
    } else {
      upcomingAppointments = data ?? [];
    }
  } catch (error) {
    console.error("[job-detail] Upcoming appointments query failed", error);
    upcomingAppointmentsError = true;
  }

  let quotes: JobQuoteSummary[] = [];
  let quotesError = false;
  try {
    const { data, error } = await supabase
      .from<JobQuoteSummary>("quotes")
      .select("id, job_id, status, total, created_at, smart_quote_used")
      .eq("workspace_id", workspace.id)
      .eq("job_id", job.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[job-detail] Failed to load quotes for job:", error);
      quotesError = true;
    } else {
      quotes = data ?? [];
    }
  } catch (error) {
    console.error("[job-detail] Quotes query failed:", error);
    quotesError = true;
  }

  const latestQuote = quotes[0] ?? null;
  const lastQuoteId = latestQuote?.id ?? null;
  const lastQuoteCreatedAt = latestQuote?.created_at ?? null;
  const lastQuoteCreatedAtFriendly = lastQuoteCreatedAt
    ? formatFriendlyDateTime(lastQuoteCreatedAt, "")
    : null;
  let lastQuoteSummary: string | null = null;
  if (latestQuote) {
    const summaryParts = ["Latest quote"];
    if (latestQuote.total != null) {
      summaryParts.push(`total ${formatCurrency(latestQuote.total)}`);
    }
    if (lastQuoteCreatedAtFriendly) {
      summaryParts.push(lastQuoteCreatedAtFriendly);
    }
    lastQuoteSummary = summaryParts.join(" · ");
  }
  if (!quotesError) {
    const aiCount = quotes.reduce(
      (count, quote) => (quote.smart_quote_used ? count + 1 : count),
      0,
    );
    const manualCount = quotes.length - aiCount;
    console.log("[smart-quote-metrics] job quotes badges", {
      jobId: job.id,
      count: quotes.length,
      aiCount,
      manualCount,
    });
  }

  const materialsQuoteCandidate = quotes[0] ?? null;
  const materialsQuoteId = materialsQuoteCandidate?.id ?? null;
  console.log("[materials-ui-job] job materials quote candidate", {
    jobId: job.id,
    materialsQuoteId,
  });
  const callScriptQuoteId = materialsQuoteId ?? quotes[0]?.id ?? null;
  const acceptedQuote = quotes.find((quote) => quote.status?.toLowerCase() === "accepted") ?? null;
  console.log("[call-script-ui-job] job call script quote candidate", {
    jobId: job.id,
    callScriptQuoteId,
  });

  const customer =
    Array.isArray(job.customers) && job.customers.length > 0
      ? job.customers[0]
      : job.customers ?? null;

  const customerName = customer?.name ?? null;
  const customerId = customer?.id ?? job.customer_id ?? null;
  const customerPhoneNumber = customer?.phone ?? null;

  const displayJobTitle = job.title ?? "Untitled job";
  const askBobJobTitle = job.title?.trim() ?? "";
  const createdLabel = formatDate(job.created_at);
  const quoteParams = new URLSearchParams();
  quoteParams.set("jobId", job.id);
  quoteParams.set("source", "job");
  const description = (job.description_raw ?? job.title ?? "").trim();
  if (description) {
    quoteParams.set("description", description);
  }
  const quoteHref = `/quotes/new?${quoteParams.toString()}`;
  const scheduleVisitHref = `/appointments/new?jobId=${job.id}`;

  let callHistory: LatestCallRecord[] = [];
  try {
    callHistory = await loadCallHistoryForJob(supabase, workspace.id, job.id, { limit: 25 });
  } catch (error) {
    console.error("[job-detail] Failed to load call history", error);
  }
  const latestCall = callHistory[0] ?? null;
  const callSummarySignals = computeCallSummarySignals(callHistory);
  const callHistoryHint =
    callSummarySignals.totalAttempts > 0
      ? buildCallHistoryHint(callSummarySignals)
      : null;

  let latestCallOutcome = null;
  try {
    latestCallOutcome = await getLatestCallOutcomeForJob(supabase, workspace.id, job.id);
  } catch (error) {
    console.error("[job-detail] Failed to load latest call outcome", {
      workspaceId: workspace.id,
      jobId: job.id,
      error,
    });
  }

  const quoteCandidate = quotes.find((quote) => quote.id === callScriptQuoteId) ?? null;
  const quoteCreatedAt = quoteCandidate?.created_at ?? null;
  const followupDueInfo: FollowupDueInfo = computeFollowupDueInfo({
    quoteCreatedAt,
    callCreatedAt: latestCall?.created_at ?? null,
    invoiceDueAt: null,
    recommendedDelayDays: null,
  });
  console.log("[job-followup-status]", {
    jobId: job.id,
    callId: latestCall?.id ?? null,
    dueStatus: followupDueInfo.dueStatus,
    hasMessage: false,
    messageId: null,
  });
  const followupStatusLabels: Record<FollowupDueStatus, string> = {
    overdue: "Overdue",
    "due-today": "Due today",
    scheduled: "Upcoming",
    none: "Done",
  };
  const followupStatusClasses: Record<FollowupDueStatus, string> = {
    overdue: "border border-amber-200 text-amber-200 bg-amber-200/10",
    "due-today": "border border-emerald-200 text-emerald-200 bg-emerald-200/10",
    scheduled: "border border-slate-600 text-slate-200 bg-slate-900/80",
    none: "border border-slate-700 text-slate-400 bg-slate-950/40",
  };
  const followupStatusChipLabel = latestCall
    ? followupStatusLabels[followupDueInfo.dueStatus]
    : null;
  const followupStatusChipClass = latestCall
    ? followupStatusClasses[followupDueInfo.dueStatus]
    : "";
  const latestCallLabelText = buildCallLabel(latestCall);

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <JobDetailsCard
        jobId={job.id}
        title={displayJobTitle}
        status={job.status}
        quoteHref={quoteHref}
        acceptedQuoteId={acceptedQuote?.id ?? null}
        scheduleVisitHref={scheduleVisitHref}
        unseenFollowupLabel={followupStatusChipLabel}
        followupDueLabel={followupDueInfo.dueLabel}
        followupStatusClass={followupStatusChipClass}
        urgency={job.urgency}
        source={job.source}
        aiUrgency={job.ai_urgency}
        priority={job.priority}
        attentionReason={job.attention_reason}
        attentionScore={job.attention_score}
        createdLabel={createdLabel}
        customerId={customerId}
        customerName={customerName}
        description={job.description_raw}
      />
          <JobAskBobFlow
            workspaceId={workspace.id}
            jobId={job.id}
            customerId={customerId ?? null}
            customerDisplayName={customerName ?? null}
            customerPhoneNumber={customerPhoneNumber ?? null}
            jobDescription={job.description_raw ?? null}
            jobTitle={askBobJobTitle}
            askBobLastTaskLabel={askBobLastTaskLabel}
            askBobLastUsedAtDisplay={askBobLastUsedAtDisplay}
            askBobLastUsedAtIso={askBobLastUsedAtIso}
            askBobRunsSummary={askBobRunsSummary}
            initialLastQuoteId={lastQuoteId ?? null}
            lastQuoteCreatedAt={lastQuoteCreatedAt ?? null}
            lastQuoteCreatedAtFriendly={lastQuoteCreatedAtFriendly ?? null}
            initialDiagnoseSnapshot={diagnoseSnapshot ?? undefined}
            initialMaterialsSnapshot={materialsSnapshot ?? undefined}
            initialQuoteSnapshot={quoteSnapshot ?? undefined}
            initialFollowupSnapshot={followupSnapshot ?? undefined}
            initialAfterCallSnapshot={afterCallSnapshot ?? undefined}
            lastQuoteSummary={lastQuoteSummary}
            latestCallLabel={latestCallLabelText}
            hasLatestCall={Boolean(latestCall)}
            callHistoryHint={callHistoryHint}
            latestCallOutcome={latestCallOutcome}
            afterCallCacheKey={afterCallCacheKey ?? undefined}
            afterCallCacheCallId={afterCallCallId ?? undefined}
          />
      <HbCard className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Upcoming visits</p>
            <h2 className="hb-heading-3 text-xl font-semibold">Scheduled appointments for this job</h2>
          </div>
          <Link
            href="/appointments"
            className="text-xs uppercase tracking-[0.3em] text-slate-400 transition hover:text-slate-200"
          >
            View all appointments
          </Link>
        </div>
        {upcomingAppointmentsError ? (
          <p className="text-sm text-slate-400">
            Something went wrong loading upcoming visits. Try refreshing the page.
          </p>
        ) : upcomingAppointments.length === 0 ? (
          <div className="space-y-2 text-sm text-slate-400">
            <p>No upcoming appointments for this job yet.</p>
            <HbButton as={Link} href={`/appointments/new?jobId=${job.id}`} size="sm" variant="secondary">
              Schedule a visit
            </HbButton>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingAppointments.map((appointment) => (
              <Link
                key={appointment.id}
                href={`/appointments/${appointment.id}`}
                className="group flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 transition hover:border-slate-600 hover:bg-slate-900"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-100">{formatDate(appointment.start_time)}</p>
                  <p className="text-xs text-slate-400">
                    {formatAppointmentTimeRange(appointment.start_time, appointment.end_time)}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.3em] font-semibold ${appointmentStatusClass(
                    appointment.status,
                  )}`}
                >
                  {appointmentStatusLabel(appointment.status)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </HbCard>
      <JobQuotesCard quotes={quotes} quotesError={quotesError} quoteHref={quoteHref} />
      <JobRecentActivityCard jobId={job.id} workspaceId={workspace.id} />
    </div>
  );
}
