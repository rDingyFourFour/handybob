export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import { formatDateTime } from "@/utils/timeline/formatters";
import {
  computeFollowupDueInfo,
  deriveFollowupRecommendation,
  isActionableFollowupDue,
  type FollowupDueInfo,
  type FollowupDueStatus,
  type FollowupRecommendation,
} from "@/lib/domain/communications/followupRecommendations";
import {
  findMatchingFollowupMessage,
  type FollowupMessageRef,
} from "@/lib/domain/communications/followupMessages";
import { markFollowupDoneAction } from "./actions/markFollowupDone";

const CHANNEL_HINTS = {
  phone: { icon: "📞", label: "Phone" },
  sms: { icon: "💬", label: "SMS" },
  email: { icon: "✉️", label: "Email" },
} as const;

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

function startOfToday(date?: Date) {
  const base = date ? new Date(date) : new Date();
  base.setHours(0, 0, 0, 0);
  base.setMilliseconds(0);
  return base;
}

const QUEUE_GROUPS: Array<{ status: FollowupDueStatus; label: string }> = [
  { status: "overdue", label: "Overdue" },
  { status: "due-today", label: "Due today" },
  { status: "scheduled", label: "Upcoming" },
];

type CallRow = {
  id: string;
  workspace_id: string;
  created_at: string | null;
  from_number: string | null;
  status: string | null;
  priority: string | null;
  needs_followup: boolean | null;
  job_id: string | null;
  customer_id: string | null;
  quote_id: string | null;
  body: string | null;
  channel: string | null;
  via: string | null;
  updated_at: string | null;
};

type QuoteCandidateSummary = {
  id: string;
  job_id: string | null;
  created_at: string | null;
};

type EnrichedCallRow = CallRow & {
  quoteCreatedAt: string | null;
  followupRecommendation: FollowupRecommendation | null;
  followupDueInfo: FollowupDueInfo;
  hasMatchingFollowupToday: boolean;
  matchingFollowupMessageId: string | null;
};

type FilteredJobSummary = {
  id: string;
  title: string | null;
  status: string | null;
};

import HbButton from "@/components/ui/hb-button";

export default async function CallsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await searchParamsPromise;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[calls] Failed to resolve workspace:", error);
    return (
      <div className="hb-shell pt-20 pb-8 space-y-4">
        <HbCard className="space-y-2">
          <h1 className="hb-heading-1 text-2xl font-semibold">Calls</h1>
          <p className="hb-muted text-sm">Unable to load workspace context.</p>
        </HbCard>
      </div>
    );
  }

  const rawJobId = searchParams?.jobId;
  const rawSummary = searchParams?.summary;
  const jobIdFilter = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId ?? null;
  const summaryFilter = rawSummary === "needs" ? "needs" : null;
  const rawFollowups = searchParams?.followups;
  const followupsFilter = Array.isArray(rawFollowups)
    ? rawFollowups[0]
    : rawFollowups ?? null;
  let filteredJob: FilteredJobSummary | null = null;

  if (jobIdFilter) {
    const { data: jobRow, error: jobError } = await supabase
      .from<FilteredJobSummary>("jobs")
      .select("id, title, status")
      .eq("workspace_id", workspace.id)
      .eq("id", jobIdFilter)
      .maybeSingle();

    if (jobError) {
      console.error("[calls] Failed to load filtered job:", jobError);
    }

    filteredJob = jobRow ?? null;
  }

  const followupQueueActive = followupsFilter === "queue";

  let query = supabase.from("calls").select("*").eq("workspace_id", workspace.id);

  if (jobIdFilter) {
    query = query.eq("job_id", jobIdFilter);
  }

  query = query.order("created_at", { ascending: false }).limit(50);

  const callsRes = await query;
  if (callsRes.error) {
    console.error("[calls/index] Supabase error loading calls", {
      workspaceId: workspace.id,
      error: callsRes.error,
    });
  } else {
    console.log("[calls/index] Loaded calls", {
      count: callsRes.data?.length ?? 0,
      workspaceId: workspace.id,
    });
  }

  const calls = (callsRes.data ?? []) as CallRow[];
  const jobIds = Array.from(
    new Set(calls.map((call) => call.job_id).filter((jobId): jobId is string => Boolean(jobId))),
  );
  const quoteCandidatesByJob: Record<string, QuoteCandidateSummary> = {};
  if (jobIds.length > 0) {
    const { data: quoteRows, error: quoteError } = await supabase
      .from<QuoteCandidateSummary>("quotes")
      .select("id, job_id, created_at")
      .in("job_id", jobIds)
      .order("created_at", { ascending: false })
      .limit(Math.max(jobIds.length * 3, 30));

    if (quoteError) {
      console.error("[calls/index] Failed to load quote candidates", quoteError);
    }

    (quoteRows ?? []).forEach((quote) => {
      if (!quote.job_id) {
        return;
      }
      if (!quoteCandidatesByJob[quote.job_id]) {
        quoteCandidatesByJob[quote.job_id] = quote;
      }
    });
  }

  const todayStart = startOfToday();
  let todayFollowupMessages: FollowupMessageRef[] = [];
  const { data: todayMessagesRows, error: todayMessagesError } = await supabase
    .from<FollowupMessageRef>("messages")
    .select("id, job_id, quote_id, invoice_id, channel, via, created_at")
    .eq("workspace_id", workspace.id)
    .gte("created_at", todayStart.toISOString())
    .in("channel", ["sms", "email", "phone"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (todayMessagesError) {
    console.error("[followup-messages] Failed to load today's messages", todayMessagesError);
  } else {
    todayFollowupMessages = todayMessagesRows ?? [];
  }

  const now = new Date();
  const callsWithFollowups: EnrichedCallRow[] = calls.map((call) => {
    const quoteCandidate =
      call.job_id && quoteCandidatesByJob[call.job_id]
        ? quoteCandidatesByJob[call.job_id]
        : null;
    const quoteCreatedAt = quoteCandidate?.created_at ?? null;
    const quoteDate = quoteCreatedAt ? new Date(quoteCreatedAt) : null;
    const daysSinceQuote =
      quoteDate && !Number.isNaN(quoteDate.getTime())
        ? Math.floor((now.getTime() - quoteDate.getTime()) / ONE_DAY_MS)
        : null;
    const trimmedBody = call.body?.trim();
    const trimmedStatus = call.status?.trim();
    const recommendationOutcome = trimmedBody || trimmedStatus || null;
    const followupRecommendation =
      recommendationOutcome &&
      deriveFollowupRecommendation({
        outcome: recommendationOutcome,
        daysSinceQuote,
        modelChannelSuggestion: null,
      });
    const recommendedChannel = followupRecommendation?.recommendedChannel ?? null;
    const matchingFollowupMessage =
      followupRecommendation &&
      findMatchingFollowupMessage({
        messages: todayFollowupMessages,
        recommendedChannel,
        jobId: call.job_id ?? null,
        quoteId: quoteCandidate?.id ?? call.quote_id ?? null,
      });
    const hasMatchingFollowupToday = Boolean(matchingFollowupMessage);
    const matchingFollowupMessageId = matchingFollowupMessage?.id ?? null;
    const followupDueInfo = computeFollowupDueInfo({
      quoteCreatedAt,
      callCreatedAt: call.created_at,
      invoiceDueAt: null,
      recommendedDelayDays: followupRecommendation?.recommendedDelayDays ?? null,
      now,
    });
    if (process.env.NODE_ENV !== "production") {
      console.log("[followup-reco]", {
        callId: call.id,
        jobId: call.job_id ?? null,
        quoteId: quoteCandidate?.id ?? call.quote_id ?? null,
        recommendedChannel,
        recommendedDelayDays:
          followupRecommendation?.recommendedDelayDays ?? null,
        shouldSkipFollowup:
          followupRecommendation?.shouldSkipFollowup ?? null,
      });
      console.log("[followup-queue-status]", {
        callId: call.id,
        jobId: call.job_id ?? null,
        quoteId: quoteCandidate?.id ?? call.quote_id ?? null,
        recommendedChannel,
        dueStatus: followupDueInfo.dueStatus,
        hasMatchingFollowupToday,
        matchingFollowupMessageId,
      });
    }
    return {
      ...call,
      quoteCreatedAt,
      followupRecommendation,
      followupDueInfo,
      hasMatchingFollowupToday,
      matchingFollowupMessageId,
    };
  });
  const summaryModeActive = !followupQueueActive && summaryFilter === "needs";
  const summaryFilteredCalls = callsWithFollowups.filter(
    (call) => !call.body?.trim(),
  );
  const followupQueueCalls = callsWithFollowups.filter((call) => {
    // TODO: once the calls table exposes an explicit follow-up state (none/due/done/snoozed),
    // respect that instead of computing status purely from messages and outcomes; skip rows where
    // the follow-up_state indicates “done” even if dueStatus might still be actionable.
    const recommendation = call.followupRecommendation;
    return (
      recommendation &&
      !recommendation.shouldSkipFollowup &&
      isActionableFollowupDue(call.followupDueInfo.dueStatus)
      && !call.hasMatchingFollowupToday
    );
  });
  const activeCalls = followupQueueActive
    ? followupQueueCalls
    : summaryModeActive
    ? summaryFilteredCalls
    : callsWithFollowups;
  console.log("[followup-queue]", {
    workspaceId: workspace.id,
    totalCalls: callsWithFollowups.length,
    queueCount: followupQueueCalls.length,
    summaryNeedsCount: summaryFilteredCalls.length,
  });
  if (followupQueueActive) {
    console.log("[followup-queue] active view", {
      workspaceId: workspace.id,
      rows: followupQueueCalls.length,
    });
  }

  const filterJobLabel = filteredJob
    ? filteredJob.title ?? `Job ${filteredJob.id.slice(0, 8)}…`
    : jobIdFilter
    ? `Job ${jobIdFilter.slice(0, 8)}…`
    : null;
  const filteredJobId = filteredJob?.id ?? jobIdFilter;
  const listHelperText = followupQueueActive
    ? jobIdFilter
      ? "Showing calls for this job with follow-ups Due today or Overdue."
      : "Showing calls with follow-ups Due today or Overdue."
    : jobIdFilter
    ? "Showing calls associated with this job."
    : null;

  const summaryNeedsHref = jobIdFilter
    ? `/calls?jobId=${encodeURIComponent(jobIdFilter)}&summary=needs`
    : "/calls?summary=needs";
  const viewAllHref = jobIdFilter
    ? `/calls?jobId=${encodeURIComponent(jobIdFilter)}`
    : "/calls";
  const followupQueueHref = jobIdFilter
    ? `/calls?jobId=${encodeURIComponent(jobIdFilter)}&followups=queue`
    : "/calls?followups=queue";
  const clearFiltersHref = jobIdFilter
    ? `/calls?jobId=${encodeURIComponent(jobIdFilter)}`
    : "/calls";

  const headerSubtitle =
    !jobIdFilter && !summaryFilter
      ? "All recent calls across your workspace."
      : "Simple log of recent calls.";

  const renderCallRow = (call: EnrichedCallRow) => {
    const summaryMissing = !call.body?.trim();
    const normalizedChannel = (call.channel ?? "phone").toLowerCase();
    const knownChannel = normalizedChannel in CHANNEL_HINTS;
    const channelKey = (knownChannel ? normalizedChannel : "phone") as keyof typeof CHANNEL_HINTS;
    const channelHint = CHANNEL_HINTS[channelKey];
    const rawChannelLabel = !knownChannel && call.channel ? call.channel : null;
    const lastUpdated = formatDateTime(call.updated_at ?? call.created_at, "—");
    const rowDueInfo = call.followupDueInfo;
    const showRowDue = rowDueInfo.dueStatus !== "none";

    return (
      <div
        key={call.id}
        className={`flex flex-col gap-3 rounded-lg border px-4 py-3 transition ${
          summaryMissing
            ? "border-amber-200/70 bg-amber-100/10 hover:bg-amber-100/20 border-l-4 border-l-amber-400"
            : "border-slate-800 bg-slate-950/60 hover:bg-slate-900/80"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {call.job_id ? (
                <Link
                  href={`/jobs/${call.job_id}`}
                  className="text-base font-semibold text-white hover:text-slate-200"
                >
                  Job #{call.job_id.slice(0, 8)}…
                </Link>
              ) : (
                <span className="text-base font-semibold text-slate-200">
                  Call {call.id.slice(0, 8)}…
                </span>
              )}
              {call.quote_id && (
                <Link
                  href={`/quotes/${call.quote_id}`}
                  className="text-sm font-medium text-slate-400 hover:text-slate-200"
                >
                  Quote #{call.quote_id.slice(0, 8)}…
                </Link>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1 text-slate-200">
                <span aria-hidden>{channelHint.icon}</span>
                <span className="font-semibold text-slate-100">
                  {channelHint.label}
                  {rawChannelLabel ? ` (${rawChannelLabel})` : ""}
                </span>
              </span>
              {call.via && <span className="text-slate-400">via {call.via}</span>}
              <span className="text-slate-400">Status: {call.status ?? "unknown"}</span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.3em] ${
                  summaryMissing
                    ? "border-amber-200 bg-amber-100/20 text-amber-200"
                    : "border-emerald-200 bg-emerald-100/20 text-emerald-200"
                }`}
              >
                {summaryMissing ? "Summary needed" : "Summary recorded"}
              </span>
              {call.hasMatchingFollowupToday && (
                call.matchingFollowupMessageId ? (
                  <Link
                    href={`/messages/${call.matchingFollowupMessageId}`}
                    className="inline-flex items-center rounded-full border border-slate-800 px-2 py-0.5 text-[11px] uppercase tracking-[0.3em] text-slate-100 hover:border-slate-600"
                  >
                    Follow-up created
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-slate-800 px-2 py-0.5 text-[11px] uppercase tracking-[0.3em] text-slate-400">
                    Follow-up created
                  </span>
                )
              )}
              {showRowDue && (
                <span
                  className={`text-[11px] font-semibold ${
                    rowDueInfo.dueStatus === "overdue"
                      ? "text-amber-200"
                      : rowDueInfo.dueStatus === "due-today"
                      ? "text-emerald-200"
                      : "text-slate-400"
                  }`}
                >
                  {rowDueInfo.dueLabel}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">
              From: {call.from_number ?? "Unknown"}
            </p>
            {call.customer_id && (
              <p className="text-xs text-slate-500">
                Customer: {call.customer_id.slice(0, 8)}…
              </p>
            )}
            <p className="text-xs text-slate-500">
              Priority: {call.priority ?? "normal"} · Needs follow-up:{" "}
              {call.needs_followup ? "Yes" : "No"}
            </p>
            <p className="text-xs text-slate-500">Last updated {lastUpdated}</p>
          </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <Link
            href={`/calls/${call.id}`}
            className="inline-flex items-center rounded-full border border-slate-800/60 px-2 py-0.5 font-semibold text-slate-100 hover:border-slate-600"
          >
            View call
          </Link>
          {followupQueueActive && (
          <form action={markFollowupDoneAction} className="flex flex-col items-end text-xs font-semibold text-emerald-200">
              <input type="hidden" name="callId" value={call.id} />
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <input type="hidden" name="jobId" value={call.job_id ?? ""} />
              <input type="hidden" name="quoteId" value={call.quote_id ?? ""} />
              <button type="submit" className="text-emerald-200 hover:text-emerald-100">
                Mark done
              </button>
            </form>
          )}
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
            {formatDateTime(call.created_at, "—")}
          </p>
        </div>
        </div>
      </div>
    );
  };

  return (
    <div className="hb-shell pt-20 pb-8 space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Calls</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Calls</h1>
          <p className="text-xs text-slate-400">
            Step 1: pick a call · Step 2: run guided call · Step 3: log summary & follow-up.
          </p>
          <p className="hb-muted text-sm">{headerSubtitle}</p>
          {followupQueueActive ? (
            <p className="mt-1 text-sm font-semibold text-emerald-200">
              Showing {followupQueueCalls.length} calls needing follow-up today.
            </p>
          ) : (
            followupQueueCalls.length > 0 && (
              <p className="mt-1 text-sm text-slate-400">
                You have {followupQueueCalls.length.toLocaleString()} calls in your follow-up queue today.{" "}
                <Link
                  href={followupQueueHref}
                  className="font-semibold text-emerald-200 hover:text-emerald-100"
                >
                  View queue
                </Link>
              </p>
            )
          )}
          {summaryFilter === "needs" && (
            <p className="mt-1 text-sm font-semibold text-emerald-200">
              Showing calls that still need a summary.
            </p>
          )}
          {jobIdFilter && filterJobLabel && (
            <div className="mt-2 space-y-2 text-slate-400">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Filtered by job</p>
              <p className="text-xl font-semibold text-white">{filterJobLabel}</p>
              <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em]">
                {filteredJob ? (
                  <>
                    <Link
                      href={`/jobs/${filteredJob.id}`}
                      className="rounded-full border border-slate-800/60 px-3 py-1 font-semibold text-slate-100 hover:border-slate-600"
                    >
                      Open job
                    </Link>
                    <Link
                      href={`/jobs/${filteredJob.id}#phone-call-script-section`}
                      className="rounded-full border border-slate-800/60 px-3 py-1 font-semibold text-slate-100 hover:border-slate-600"
                    >
                      Open job phone agent
                    </Link>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">
                    Job ID {jobIdFilter.slice(0, 8)}… not found
                  </span>
                )}
                {filteredJobId && (
                  <Link
                    href={`/calls/new?jobId=${encodeURIComponent(filteredJobId)}`}
                    className="rounded-full border border-slate-800/60 px-3 py-1 font-semibold text-slate-100 hover:border-slate-600"
                  >
                    New call for this job
                  </Link>
                )}
              </div>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em]">
            {followupQueueActive ? (
              <>
                <span className="rounded-full border border-emerald-200 bg-emerald-100/20 px-3 py-1 font-semibold text-emerald-200">
                  Follow-up queue
                </span>
                <Link
                  href={clearFiltersHref}
                  className="rounded-full border border-slate-800/60 px-3 py-1 font-semibold text-slate-100 hover:border-slate-600"
                >
                  View all calls
                </Link>
              </>
            ) : (
              <>
                {summaryFilter === "needs" ? (
                  <>
                    <span className="rounded-full border border-emerald-200 bg-emerald-100/20 px-3 py-1 font-semibold text-emerald-200">
                      Showing calls needing summary
                    </span>
                    <Link
                      href={viewAllHref}
                      className="rounded-full border border-slate-800/60 px-3 py-1 font-semibold text-slate-100 hover:border-slate-600"
                    >
                      View all calls
                    </Link>
                  </>
                ) : (
                  <Link
                    href={summaryNeedsHref}
                    className="rounded-full border border-slate-800/60 px-3 py-1 font-semibold text-slate-100 hover:border-slate-600"
                  >
                    Show calls needing summary
                  </Link>
                )}
                <Link
                  href={followupQueueHref}
                  className="rounded-full border border-slate-800/60 px-3 py-1 font-semibold text-slate-100 hover:border-slate-600"
                >
                  Follow-up queue
                </Link>
              </>
            )}
          </div>
        </div>
        <HbButton
          as={Link}
          href={
            jobIdFilter
              ? `/calls/new?jobId=${encodeURIComponent(jobIdFilter)}`
              : "/calls/new"
          }
          size="sm"
          variant="secondary"
        >
          New call
        </HbButton>
      </header>

      {listHelperText && (
        <p className="px-4 text-sm text-slate-400">{listHelperText}</p>
      )}
      <HbCard className="space-y-3">
        {activeCalls.length === 0 ? (
          followupQueueActive ? (
            <div className="space-y-4">
              <h2 className="hb-card-heading text-lg font-semibold">
                No follow-ups due right now.
              </h2>
              <p className="hb-muted text-sm">
                You’re all caught up for today. Switch back to “All calls” to review recent sessions,
                or open Jobs to find more customers to follow up with.
              </p>
              <HbButton
                as={Link}
                href={clearFiltersHref}
                size="sm"
                variant="secondary"
              >
                View all calls
              </HbButton>
            </div>
          ) : !jobIdFilter && !summaryModeActive ? (
            <div className="space-y-4">
              <h2 className="hb-card-heading text-lg font-semibold">No calls yet</h2>
              <p className="hb-muted text-sm">
                Start by opening a job and creating a call workspace for it. You can create a call
                from a job using the “Open phone agent” pill on the job page, or hit “New call”
                above if you’re starting directly from this workspace.
              </p>
              <HbButton as={Link} href="/jobs" size="sm" variant="secondary">
                Open jobs
              </HbButton>
            </div>
          ) : summaryModeActive ? (
            <div className="space-y-2">
              <h2 className="hb-card-heading text-lg font-semibold">
                No calls need a summary right now.
              </h2>
              <p className="hb-muted text-sm">
                {filterJobLabel
                  ? `Once you finish guided calls without a summary for ${filterJobLabel}, they’ll appear here.`
                  : "Once you finish guided calls without a summary, they’ll appear here."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <h2 className="hb-card-heading text-lg font-semibold">No calls for this job yet.</h2>
              <p className="hb-muted text-sm">
                {filterJobLabel
                  ? `${filterJobLabel} has no calls yet. Use 'New call for this job' to start the first phone agent session.`
                  : "No calls logged for this job yet. Use 'New call for this job' to start the first phone agent session."}
              </p>
            </div>
          )
        ) : followupQueueActive ? (
          <div className="space-y-5">
            {QUEUE_GROUPS.map(({ status, label }) => {
              const grouped = activeCalls.filter(
                (call) => call.followupDueInfo.dueStatus === status,
              );
              if (grouped.length === 0) {
                return null;
              }
              return (
                <div key={status} className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</p>
                  <div className="space-y-3">
                    {grouped.map((call) => renderCallRow(call))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {activeCalls.map((call) => renderCallRow(call))}
          </div>
        )}
      </HbCard>

    </div>
  );
}
