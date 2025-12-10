export const dynamic = "force-dynamic";

import type { ReactNode } from "react";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import { formatCurrency, formatFriendlyDateTime } from "@/utils/timeline/formatters";
import { getJobAskBobHudSummary } from "@/lib/domain/askbob/service";
import JobCallScriptPanel, { type PhoneMessageSummary } from "./JobCallScriptPanel";
import {
  computeFollowupDueInfo,
  type FollowupDueStatus,
  type FollowupDueInfo,
} from "@/lib/domain/communications/followupRecommendations";
import JobAskBobContainer from "@/components/askbob/JobAskBobContainer";

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

const smartQuoteBadgeClasses =
  "inline-flex items-center gap-2 rounded-full border px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.3em] bg-amber-500/10 border-amber-400/40 text-amber-300";
const smartQuoteBadgeDotClasses = "h-1.5 w-1.5 rounded-full bg-amber-300";

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

export default async function JobDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

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

  const hasQuoteContextForFollowup = quotes.length > 0;

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

  let latestPhoneMessage: PhoneMessageSummary | null = null;
  try {
    const { data, error } = await supabase
      .from<PhoneMessageSummary>("messages")
      .select("id, channel, body, created_at, outcome")
      .eq("workspace_id", workspace.id)
      .eq("job_id", job.id)
      .eq("channel", "phone")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[job-detail] Latest phone message lookup failed", error);
    } else {
      latestPhoneMessage = data ?? null;
    }
  } catch (error) {
    console.error("[job-detail] Latest phone message query failed", error);
  }

  const customer =
    Array.isArray(job.customers) && job.customers.length > 0
      ? job.customers[0]
      : job.customers ?? null;

  const customerName = customer?.name ?? null;
  const customerPhone = customer?.phone ?? null;
  const customerFirstName = customerName ? customerName.split(" ")[0] : null;
  const customerId = customer?.id ?? job.customer_id ?? null;

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
  const callAgentParams = new URLSearchParams();
  callAgentParams.set("jobId", job.id);
  if (callScriptQuoteId) {
    callAgentParams.set("quoteId", callScriptQuoteId);
  }
  const callAgentHref = `/calls/new?${callAgentParams.toString()}`;

  let latestCall: LatestCallRecord | null = null;
  try {
    const { data, error } = await supabase
      .from<LatestCallRecord>("calls")
      .select("id, job_id, workspace_id, created_at")
      .eq("workspace_id", workspace.id)
      .eq("job_id", job.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[job-detail] Latest call lookup failed", error);
    } else {
      latestCall = data ?? null;
    }
  } catch (error) {
    console.error("[job-detail] Latest call query failed", error);
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

  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Job details</p>
            <h1 className="hb-heading-2 text-2xl font-semibold">{displayJobTitle}</h1>
            <p className="text-sm text-slate-400">Status: {job.status ?? "—"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {customerId && customerName ? (
                <Link
                  href={`/customers/${customerId}`}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs font-semibold text-slate-100 transition hover:border-slate-600 hover:bg-slate-900"
                >
                  <span className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Customer</span>
                  <span className="text-sm">{customerName}</span>
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-800 bg-slate-950/60 px-3 py-1 text-xs uppercase tracking-[0.3em] text-slate-500">
                  Attach customer (coming soon)
                </span>
              )}
            </div>
          </div>
        <div className="flex flex-wrap gap-2">
          <HbButton as={Link} href={quoteHref} size="sm" variant="secondary">
            Generate quote from job
          </HbButton>
          {acceptedQuote && (
            <HbButton
              as={Link}
              href={`/invoices/new?jobId=${job.id}&quoteId=${acceptedQuote.id}`}
              size="sm"
              variant="secondary"
            >
              Create invoice
            </HbButton>
          )}
          <HbButton as={Link} href={`/appointments/new?jobId=${job.id}`} size="sm" variant="secondary">
            Schedule visit
          </HbButton>
          <HbButton as={Link} href={callAgentHref} size="sm" variant="secondary">
            Open phone agent
          </HbButton>
          <HbButton as="a" href="/jobs" size="sm">
            Back to jobs
          </HbButton>
        </div>
        </header>
        {followupStatusChipLabel && (
          <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-200">
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Next follow-up</p>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.3em] font-semibold ${followupStatusChipClass}`}
              >
                {followupStatusChipLabel}
              </span>
              <span className="text-sm text-slate-300">{followupDueInfo.dueLabel}</span>
            </div>
          </div>
        )}
        {!followupStatusChipLabel && (
          <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-200">
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Next follow-up</p>
            <p className="text-sm text-slate-400">
              No calls yet –{" "}
              <Link className="font-semibold text-emerald-200 hover:text-emerald-100" href={callAgentHref}>
                start with the phone agent
              </Link>
              .
            </p>
          </div>
        )}
        <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-2">
          <p>Urgency: {job.urgency ?? "—"}</p>
          <p>Source: {job.source ?? "—"}</p>
          <p>AI urgency: {job.ai_urgency ?? "—"}</p>
          <p>Priority: {job.priority ?? "—"}</p>
          <p>Attention reason: {job.attention_reason ?? "—"}</p>
          <p>Attention score: {job.attention_score ?? "—"}</p>
          <p>Created: {createdLabel}</p>
          {customerName && customerId && (
            <p>
              Customer:{" "}
              <Link href={`/customers/${customerId}`} className="text-sky-300 hover:text-sky-200">
                {customerName}
              </Link>
            </p>
          )}
        </div>
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Description:</p>
          <p className="text-sm text-slate-300">{job.description_raw ?? "No description provided."}</p>
        </div>
      </HbCard>
        <JobAskBobContainer
          workspaceId={workspace.id}
          jobId={job.id}
          customerId={customerId ?? undefined}
          jobDescription={job.description_raw ?? ""}
          jobTitle={askBobJobTitle}
          askBobLastTaskLabel={askBobLastTaskLabel}
          askBobLastUsedAtDisplay={askBobLastUsedAtDisplay}
          askBobLastUsedAtIso={askBobLastUsedAtIso}
          askBobRunsSummary={askBobRunsSummary}
          hasQuoteContextForFollowup={hasQuoteContextForFollowup}
          lastQuoteId={lastQuoteId ?? undefined}
          lastQuoteCreatedAt={lastQuoteCreatedAt ?? undefined}
          lastQuoteCreatedAtFriendly={lastQuoteCreatedAtFriendly ?? undefined}
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
      <HbCard className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Job quotes</p>
          <h2 className="hb-heading-3 text-xl font-semibold">Quotes for this job</h2>
        </div>
      {quotesError ? (
        <div className="space-y-2 text-sm text-slate-400">
            <p>Something went wrong. We couldn’t load quotes for this job.</p>
            <HbButton as={Link} href={quoteHref} size="sm" variant="secondary">
              New quote for this job
            </HbButton>
          </div>
        ) : quotes.length === 0 ? (
          <div className="space-y-2 text-sm text-slate-400">
            <p>No quotes yet for this job.</p>
            <HbButton as={Link} href={quoteHref} size="sm" variant="secondary">
              New quote for this job
            </HbButton>
          </div>
        ) : (
          <div className="space-y-2">
            {quotes.map((quote) => {
              const isAiQuote = !!quote.smart_quote_used;
              return (
                <Link
                  key={quote.id}
                  href={`/quotes/${quote.id}`}
                  className="block rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300 transition hover:border-slate-600 hover:bg-slate-900"
                >
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <span className="font-semibold">Quote {quote.id.slice(0, 8)}</span>
                    <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                      Created {formatDate(quote.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-2">
                      Status: {quote.status ?? "—"}
                      {isAiQuote && (
                        <span className={smartQuoteBadgeClasses}>
                          <span className={smartQuoteBadgeDotClasses} />
                          Smart Quote
                        </span>
                      )}
                    </span>
                    <span>Total: {quote.total != null ? formatCurrency(quote.total) : "—"}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </HbCard>
      {callScriptQuoteId ? (
        <JobCallScriptPanel
          quoteId={callScriptQuoteId}
          jobId={job.id}
          workspaceId={workspace.id}
          latestPhoneMessage={latestPhoneMessage}
          customerName={customerName}
          customerFirstName={customerFirstName}
          customerPhone={customerPhone}
          mode="job"
          context="job-sidebar"
        />
      ) : (
        <HbCard className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Phone call script</p>
          <p className="text-sm text-slate-400">
            Create a quote for this job first, then we’ll help you draft a call script.
          </p>
        </HbCard>
      )}
    </div>
  );
}
