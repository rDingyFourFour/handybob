export const dynamic = "force-dynamic";

import Link from "next/link";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import CallSummaryStatus from "@/components/call-summary-status";
import HbCard from "@/components/ui/hb-card";
import JobCallScriptPanel, {
  type PhoneMessageSummary,
} from "@/app/(app)/jobs/[id]/JobCallScriptPanel";
import {
  deriveFollowupRecommendation,
  type NextActionSuggestion,
} from "@/lib/domain/communications/followupRecommendations";

type CallRecord = {
  id: string;
  workspace_id: string;
  body: string | null;
  created_at: string | null;
  channel: string | null;
  via: string | null;
  job_id: string | null;
  from_number: string | null;
  to_number: string | null;
};

const CALL_FROM_PLACEHOLDER = "workspace-default";
const CALL_TO_PLACEHOLDER = "unknown";

type JobSummary = {
  id: string;
  title: string | null;
  status: string | null;
  customer_id: string | null;
  customers:
    | { id: string | null; name: string | null; phone?: string | null }
    | Array<{ id: string | null; name: string | null; phone?: string | null }>
    | null;
};

type JobQuoteCandidate = {
  id: string;
  job_id: string | null;
  status: string | null;
  total: number | null;
  created_at: string | null;
  smart_quote_used: boolean | null;
};

type MessageRecord = {
  id: string;
  job_id: string | null;
  quote_id: string | null;
  channel: string | null;
  via: string | null;
  subject: string | null;
  body: string | null;
  created_at: string | null;
  outcome: string | null;
};

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

function formatCurrency(value: number | null | undefined) {
  if (value == null) {
    return "—";
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(value);
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

function formatFollowupTimingDescription(days: number | null): string {
  if (days === null) {
    return "soon";
  }
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "tomorrow";
  }
  return `in about ${days} days`;
}

function formatFollowupTimingText(days: number | null): string {
  if (days === null) {
    return "Suggested timing: soon.";
  }
  if (days === 0) {
    return "Suggested timing: send this today.";
  }
  if (days === 1) {
    return "Suggested timing: send this tomorrow.";
  }
  return `Suggested timing: in about ${days} days.`;
}

function MessageCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{body}</p>
        <Link
          href="/calls"
          className="text-sm font-semibold text-sky-300 hover:text-sky-200"
        >
          Back to calls
        </Link>
      </HbCard>
    </div>
  );
}

export default async function CallSessionPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await paramsPromise;

  if (!id || !id.trim()) {
    return (
      <MessageCard
        title="Call unavailable"
        body="We couldn’t resolve that call. Please return to the calls list."
      />
    );
  }

  const supabase = await createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  const workspace = workspaceContext.workspace;

  if (!workspace) {
    return (
      <MessageCard
        title="Workspace required"
        body="We can’t load workspace context right now. Try again in a moment."
      />
    );
  }

  console.log("[calls/[id]/page] Loading call session", { id, workspaceId: workspace.id });

  const {
    data: call,
    error: callError,
  } = await supabase
    .from<CallRecord>("calls")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("id", id)
    .maybeSingle();

  if (callError) {
    console.error("[calls/[id]/page] Supabase error loading call", {
      id,
      workspaceId: workspace.id,
      error: callError,
    });
    return (
      <MessageCard
        title="Call not found"
        body="We couldn’t find that call or it no longer exists for this workspace."
      />
    );
  }

  if (!call) {
    console.warn("[calls/[id]/page] Call not found in DB", { id, workspaceId: workspace.id });
    return (
      <MessageCard
        title="Call not found"
        body="We couldn’t find that call or it no longer exists for this workspace."
      />
    );
  }

  const callFromLabel = call.from_number?.trim() || "Unknown";
  const callToLabel = call.to_number?.trim() || "Unknown";
  const fromNeedsConfig =
    !call.from_number?.trim() || call.from_number === CALL_FROM_PLACEHOLDER;
  const toNeedsConfig = !call.to_number?.trim() || call.to_number === CALL_TO_PLACEHOLDER;

  const jobId = call.job_id ?? null;

  let job: JobSummary | null = null;
  if (jobId) {
    const { data: jobRow, error: jobError } = await supabase
      .from<JobSummary>("jobs")
      .select("id, title, status, customer_id, customers(id, name, phone)")
      .eq("workspace_id", workspace.id)
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) {
      console.error("[call-session] Failed to load job", jobError);
    }

    job = jobRow ?? null;
  }

  if (job) {
    console.log("[calls/[id]/page] Loaded job for call", {
      callId: call.id,
      jobId: job.id,
    });
  }
  let callScriptQuoteCandidate: JobQuoteCandidate | null = null;
  let callScriptQuoteId: string | null = null;
  if (job) {
    try {
      const { data: candidateQuotes, error: candidateError } = await supabase
        .from<JobQuoteCandidate>("quotes")
        .select("id, job_id, status, total, created_at, smart_quote_used")
        .eq("workspace_id", workspace.id)
        .eq("job_id", job.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (candidateError) {
        console.error("[calls/[id]/page] Failed to load quote candidate for job", {
          jobId: job.id,
          error: candidateError,
        });
      } else {
        const candidate = candidateQuotes?.[0] ?? null;
        callScriptQuoteCandidate = candidate;
        callScriptQuoteId = candidate?.id ?? null;
      }
    } catch (error) {
      console.error("[calls/[id]/page] Quote candidate query failed", error);
    }

    if (callScriptQuoteId) {
      console.log("[calls/[id]/page] Call script quote candidate", {
        callId: call.id,
        jobId: job.id,
        quoteId: callScriptQuoteId,
      });
    } else {
      console.log("[calls/[id]/page] No call script quote candidate for job", {
        callId: call.id,
        jobId: job.id,
      });
    }
  }

  let messages: MessageRecord[] = [];
  if (jobId) {
    const messagesQuery = supabase
      .from<MessageRecord>("messages")
      .select(
        "id, job_id, quote_id, channel, via, subject, body, created_at, outcome"
      )
      .eq("workspace_id", workspace.id)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: messageRows, error: messageError } = await messagesQuery;
    if (messageError) {
      console.error("[call-session] Failed to load messages", messageError);
    }

    messages = messageRows ?? [];
  }

  const latestPhoneMessageSource = messages.find((message) => message.channel === "phone");
  const latestPhoneMessage: PhoneMessageSummary | null = latestPhoneMessageSource
    ? {
        id: latestPhoneMessageSource.id,
        channel: latestPhoneMessageSource.channel,
        body: latestPhoneMessageSource.body,
        created_at: latestPhoneMessageSource.created_at,
        outcome: latestPhoneMessageSource.outcome ?? null,
      }
    : null;

  const daysSinceQuote = calculateDaysSince(callScriptQuoteCandidate?.created_at ?? null);
  const followupRecommendation: NextActionSuggestion | null = deriveFollowupRecommendation({
    outcome: latestPhoneMessage?.outcome ?? null,
    daysSinceQuote,
    modelChannelSuggestion: null,
  });
  const shouldSkipFollowup = followupRecommendation?.shouldSkipFollowup ?? false;
  const followupTimingDescription = formatFollowupTimingDescription(
    followupRecommendation?.recommendedDelayDays ?? null,
  );
  const followupTimingText = formatFollowupTimingText(
    followupRecommendation?.recommendedDelayDays ?? null,
  );
  console.log("[calls/[id]] followup recommendation", {
    callId: call.id,
    jobId: job?.id ?? null,
    quoteId: callScriptQuoteCandidate?.id ?? null,
    recommendation: followupRecommendation,
  });

  const createdAtLabel = formatDate(call.created_at);
  const channelLabel = call.channel ?? "phone";
  const viaLabel = call.via ?? "email";
  const callSummary = call.body?.trim() ? call.body : "No summary recorded for this call yet.";
  const summaryMissing = !call.body?.trim();

  const jobLink = jobId ? `/jobs/${jobId}` : undefined;
  const displayJobTitle =
    job?.title ?? (jobId ? `Job ${jobId.slice(0, 8)}…` : "Not linked to a job");
  const jobStatus = job?.status ?? "Status unknown";

  const quoteLink = callScriptQuoteId ? `/quotes/${callScriptQuoteId}` : undefined;
  const displayQuoteLabel = callScriptQuoteCandidate
    ? `Quote ${callScriptQuoteCandidate.id.slice(0, 8)}…${
        callScriptQuoteCandidate.total != null ? ` · total ${formatCurrency(callScriptQuoteCandidate.total)}` : ""
      }`
    : callScriptQuoteId
    ? `Quote ${callScriptQuoteId.slice(0, 8)}…`
    : "No quote linked";

  const customer =
    job && job.customers
      ? Array.isArray(job.customers) && job.customers.length > 0
        ? job.customers[0]
        : job.customers
      : null;
  const customerName = customer?.name ?? null;
  const customerPhone = customer?.phone ?? null;
  const customerFirstName = customerName ? customerName.split(" ")[0] : null;

  return (
    <div className="hb-shell pt-20 pb-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 border-b border-slate-900 pb-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call session</p>
              <h1 className="hb-heading-1 text-3xl font-semibold">Call session</h1>
            </div>
            {call.created_at && (
              <p className="text-sm text-slate-400">Created {createdAtLabel}</p>
            )}
            {job && job.id && (
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-slate-400">
                <span className="font-semibold text-slate-100">
                  For job: {job?.title ?? jobId?.slice(0, 8)}
                </span>
                <Link
                  href={`/jobs/${job.id}`}
                  className="rounded-full border border-slate-800/60 px-2 py-0.5 font-semibold text-slate-100 hover:border-slate-600"
                >
                  Open job
                </Link>
                <Link
                  href={`/jobs/${job.id}?agent=phone`}
                  className="rounded-full border border-slate-800/60 px-2 py-0.5 font-semibold text-slate-100 hover:border-slate-600"
                >
                  Open job phone workspace
                </Link>
              </div>
            )}
          </div>
          <Link
            href="/calls"
            className="rounded-full border border-slate-800/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-100 hover:border-slate-600"
          >
            Back to calls
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <HbCard className="space-y-6">
          <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Created</p>
              <p className="mt-1 text-base text-white">{createdAtLabel}</p>
            </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Channel</p>
                <p className="mt-1 text-base text-white capitalize">{channelLabel}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Via</p>
                <p className="mt-1 text-base text-white capitalize">{viaLabel}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call workspace</p>
              <h2 className="hb-heading-3 text-xl font-semibold text-white">
                Phone call details
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                {customerName && (
                  <span className="text-slate-100">Customer: {customerName}</span>
                )}
                <span className="text-slate-100">From: {callFromLabel}</span>
                <span className="text-slate-100">To: {callToLabel}</span>
                <span className="text-slate-100">Created {createdAtLabel}</span>
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-800/40 pt-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Summary</p>
              {job && job.id && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Job:</span>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="font-semibold text-slate-100 hover:text-slate-200"
                  >
                    {job?.title ?? job.id.slice(0, 8)}
                  </Link>
                  <span className="rounded-full border border-slate-800/60 bg-slate-900/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-slate-400">
                    {jobStatus}
                  </span>
                </div>
              )}
              {callScriptQuoteCandidate ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Quote:</span>
                  {quoteLink ? (
                    <Link
                      href={quoteLink}
                      className="font-semibold text-slate-100 hover:text-slate-200"
                    >
                      {displayQuoteLabel}
                    </Link>
                  ) : (
                    <span className="font-semibold text-slate-100">{displayQuoteLabel}</span>
                  )}
                  <span className="rounded-full border border-slate-800/60 bg-slate-900/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-slate-400">
                    {callScriptQuoteCandidate.status ?? "Status unknown"}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  No quote linked to this job; guided scripts will be limited until you attach one.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <CallSummaryStatus
                  callId={call.id}
                  initialStatus={summaryMissing ? "needed" : "recorded"}
                />
                {summaryMissing && (
                  <p className="text-xs text-slate-400">
                    Complete the guided call summary in the panel to the right.
                  </p>
                )}
              </div>
              <p className="text-sm text-slate-200">{callSummary}</p>
              {followupRecommendation?.shouldSkipFollowup && (
                <p className="text-xs text-slate-400">
                  No further follow-up recommended based on this outcome.
                </p>
              )}
            </div>

            {call && job && callScriptQuoteCandidate && (
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">How this works</p>
                <ol className="space-y-1 text-sm text-slate-400">
                  <li className="flex gap-2">
                    <span className="font-semibold text-slate-400">1.</span>
                    <span>Review the script and key points on the right.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-slate-400">2.</span>
                    <span>Call the customer and walk through the guided checklist.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-slate-400">3.</span>
                    <span>Log what happened in the summary and send an optional follow-up.</span>
                  </li>
                </ol>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Job</p>
                <p className="text-lg font-semibold text-white">{displayJobTitle}</p>
                <p className="text-xs text-slate-400">{jobStatus}</p>
                {jobLink && (
                  <Link
                    href={jobLink}
                    className="text-sm font-semibold text-sky-300 hover:text-sky-200"
                  >
                    View job
                  </Link>
                )}
              </div>

              <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Quote</p>
                <p className="text-lg font-semibold text-white">{displayQuoteLabel}</p>
                <p className="text-xs text-slate-400">
                  Status: {callScriptQuoteCandidate?.status ?? "Unknown"}
                </p>
                <p className="text-xs text-slate-400">
                  Total: {formatCurrency(callScriptQuoteCandidate?.total ?? null)}
                </p>
                {quoteLink && (
                  <Link
                    href={quoteLink}
                    className="text-sm font-semibold text-sky-300 hover:text-sky-200"
                  >
                    View quote
                  </Link>
                )}
              </div>
            </div>
          </HbCard>

          <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Agent tools</p>
            </div>
            <p className="text-sm text-slate-400">
              This call session is linked to the job and quote above. Use the guided workspace to walk the call,
              capture a summary, and trigger follow-ups, and use the activity stream to review what has already
              been sent.
            </p>
            {followupRecommendation && !shouldSkipFollowup && (
              <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-100">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Next suggested step</p>
                  {followupRecommendation.recommendedChannel && (
                    <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-slate-300">
                      {followupRecommendation.recommendedChannel.toUpperCase()}
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-slate-100">
                  {followupRecommendation.primaryActionLabel}
                </p>
                <p className="text-xs text-slate-400">{followupTimingText}</p>
                <p className="text-xs text-slate-400">{followupRecommendation.rationale}</p>
                <p className="text-xs text-slate-400">
                  If you accept this suggestion, we’ll create a{" "}
                  {followupRecommendation.recommendedChannel
                    ? followupRecommendation.recommendedChannel.toUpperCase()
                    : "follow-up"}{" "}
                  follow-up draft to send {followupTimingDescription}.
                </p>
                <Link
                  href="/messages"
                  className="text-sm font-semibold text-sky-300 hover:text-sky-200"
                >
                  Prepare follow-up message
                </Link>
              </div>
            )}
            <div className="space-y-2 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-100">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call endpoints</p>
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>From</span>
                <span className="font-semibold text-slate-100">{callFromLabel}</span>
              </div>
              {fromNeedsConfig && (
                <p className="text-xs text-amber-200">
                  Telephony settings aren’t configured yet; this call is currently a logged record only.
                </p>
              )}
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>To</span>
                <span className="font-semibold text-slate-100">{callToLabel}</span>
              </div>
              {toNeedsConfig && (
                <p className="text-xs text-amber-200">
                  Add a customer phone number or configure the workspace number to make this call actionable later.
                </p>
              )}
            </div>
            {job && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Guided call checklist</p>
                <ol className="mt-2 space-y-1 text-sm text-slate-200">
                  <li className="flex gap-2">
                    <span className="font-semibold text-slate-400">1.</span>
                    <span>Review the AI-prepared script.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-slate-400">2.</span>
                    <span>Click Start guided call when you’re ready to talk.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-slate-400">3.</span>
                    <span>Log the outcome and let the assistant draft a follow-up.</span>
                  </li>
                </ol>
              </div>
            )}
            <div className="border-t border-slate-800 pt-4 space-y-4">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Guided call workspace</p>
                {job ? (
                  <>
                    <p className="text-sm text-slate-400">
                      {callScriptQuoteId
                        ? "Use the guided script and checklist below to conduct this call and capture the outcome."
                        : "No quote detected for this job; attach one so guided scripts and summaries work."}
                    </p>
                    {callScriptQuoteId && (
                      <p className="text-xs text-slate-400">
                        Use the Start guided call button below when you’re actively on the phone.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-400">
                    Job record missing for this call, so guided tools are unavailable.
                  </p>
                )}
              </div>
              {job ? (
                <>
                  {!callScriptQuoteId && (
                    <p className="text-sm text-amber-200">
                      Guided scripts require a quote; add one to this job to unlock the full experience.
                    </p>
                  )}
                  {console.log("[calls/[id]] Guided workspace context", {
                    callId: call.id,
                    jobId: job.id,
                    quoteId: callScriptQuoteId,
                    context: "call-session",
                  })}
                  <JobCallScriptPanel
                    quoteId={callScriptQuoteId}
                    jobId={job.id}
                    workspaceId={workspace.id}
                    latestPhoneMessage={latestPhoneMessage}
                    customerName={customerName}
                    customerFirstName={customerFirstName}
                    customerPhone={customerPhone}
                    mode="callSession"
                    context="call-session"
                    callId={call.id}
                  />
                </>
              ) : (
                <p className="text-sm text-slate-400">
                  Job record missing for this call. Please recreate the call from the job page or check your data.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Recent activity</p>
              {messages.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">
                  No recent phone notes or follow-ups for this job yet.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {messages.map((message) => {
                    const createdAtMsg = message.created_at ? new Date(message.created_at) : null;
                    const channelLabel = (message.channel ?? "other") as string;
                    const viaLabel = (message.via ?? "email") as string;

                    return (
                      <li
                        key={message.id}
                        className="space-y-1 rounded-lg border border-slate-850/60 bg-slate-950/80 px-3 py-2 text-xs text-slate-100"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">
                          <span className="font-semibold text-slate-200">
                            {message.subject || "Untitled message"}
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{channelLabel}</span>
                            <span>{viaLabel}</span>
                            {createdAtMsg && (
                              <span>
                                {createdAtMsg.toLocaleDateString()} {" "}
                                {createdAtMsg.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                        {message.body && (
                          <p className="text-sm text-slate-300">{message.body}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
