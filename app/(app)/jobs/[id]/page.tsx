export const dynamic = "force-dynamic";

import type { ReactNode } from "react";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import { formatCurrency } from "@/utils/timeline/formatters";
import JobMaterialsPanel from "./JobMaterialsPanel";
import JobCallScriptPanel, { type PhoneMessageSummary } from "./JobCallScriptPanel";
import {
  computeFollowupDueInfo,
  deriveFollowupRecommendation,
  type FollowupDueStatus,
  type FollowupDueInfo,
} from "@/lib/domain/communications/followupRecommendations";
import {
  findMatchingFollowupMessage,
  type FollowupMessageRef,
} from "@/lib/domain/communications/followupMessages";

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
  quote_id: string | null;
  body: string | null;
  status: string | null;
  channel: string | null;
  via: string | null;
  created_at: string | null;
};

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

function calculateDaysSince(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs <= 0) {
    return 0;
  }
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
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
  const materialsQuoteDescription = materialsQuoteCandidate
    ? `Quote ${materialsQuoteCandidate.id.slice(0, 8)}${
        materialsQuoteCandidate.total != null
          ? ` · total ${formatCurrency(materialsQuoteCandidate.total)}`
          : ""
      }`
    : null;
  console.log("[materials-ui-job] job materials quote candidate", {
    jobId: job.id,
    materialsQuoteId,
  });
  const callScriptQuoteId = materialsQuoteId ?? quotes[0]?.id ?? null;
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

  const jobTitle = job.title ?? "Untitled job";
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
      .select("id, job_id, quote_id, body, status, channel, via, created_at")
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

  const todayStart = startOfToday();
  let todayFollowupMessages: FollowupMessageRef[] = [];
  try {
    const { data, error } = await supabase
      .from<FollowupMessageRef>("messages")
      .select("id, job_id, quote_id, channel, via, created_at")
      .eq("workspace_id", workspace.id)
      .eq("job_id", job.id)
      .gte("created_at", todayStart.toISOString())
      .in("channel", ["sms", "email", "phone"])
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[job-detail] Today’s follow-up messages lookup failed", error);
    } else {
      todayFollowupMessages = data ?? [];
    }
  } catch (error) {
    console.error("[job-detail] Today’s follow-up messages query failed", error);
  }

  const quoteCandidate = quotes.find((quote) => quote.id === callScriptQuoteId) ?? null;
  const quoteCreatedAt = quoteCandidate?.created_at ?? null;
  const daysSinceQuote = calculateDaysSince(quoteCreatedAt);
  const callOutcome =
    latestCall?.body?.trim() ||
    latestCall?.status?.trim() ||
    null;
  const followupRecommendation =
    callOutcome &&
    deriveFollowupRecommendation({
      outcome: callOutcome,
      daysSinceQuote,
      modelChannelSuggestion: null,
    });
  const followupDueInfo: FollowupDueInfo = computeFollowupDueInfo({
    quoteCreatedAt,
    callCreatedAt: latestCall?.created_at ?? null,
    recommendation: followupRecommendation,
  });
  const matchingFollowupMessage =
    followupRecommendation &&
    findMatchingFollowupMessage({
      messages: todayFollowupMessages,
      recommendedChannel: followupRecommendation.recommendedChannel,
      jobId: job.id,
      quoteId: latestCall?.quote_id ?? callScriptQuoteId,
    });
  console.log("[job-followup-status]", {
    jobId: job.id,
    callId: latestCall?.id ?? null,
    dueStatus: followupDueInfo.dueStatus,
    hasMessage: Boolean(matchingFollowupMessage),
    messageId: matchingFollowupMessage?.id ?? null,
  });
  const followupStatusLabels: Record<FollowupDueStatus, string> = {
    overdue: "Overdue",
    "due-today": "Due today",
    upcoming: "Upcoming",
    none: "Done",
  };
  const followupStatusClasses: Record<FollowupDueStatus, string> = {
    overdue: "border border-amber-200 text-amber-200 bg-amber-200/10",
    "due-today": "border border-emerald-200 text-emerald-200 bg-emerald-200/10",
    upcoming: "border border-slate-600 text-slate-200 bg-slate-900/80",
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
            <h1 className="hb-heading-2 text-2xl font-semibold">{jobTitle}</h1>
            <p className="text-sm text-slate-400">Status: {job.status ?? "—"}</p>
          </div>
        <div className="flex flex-wrap gap-2">
          <HbButton as={Link} href={quoteHref} size="sm" variant="secondary">
            Generate quote from job
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
              {matchingFollowupMessage && (
                <Link
                  href={`/messages/${matchingFollowupMessage.id}`}
                  className="text-sm font-semibold text-sky-300 hover:text-sky-200"
                >
                  View follow-up message
                </Link>
              )}
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
      <JobMaterialsPanel
        jobId={job.id}
        jobTitle={jobTitle}
        jobDescription={job.description_raw ?? null}
        materialsQuoteId={materialsQuoteId}
        materialsQuoteDescription={materialsQuoteDescription}
      />
    </div>
  );
}
