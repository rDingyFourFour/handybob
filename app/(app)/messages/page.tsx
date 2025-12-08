export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import {
  FollowupMessageRef,
  CallFollowupDescriptor,
  collectCallFollowupMessageIds,
  computeFollowupMessageCounts,
  parseFollowupMessageTimestamp,
} from "@/lib/domain/communications/followupMessages";
import { MessagesWithInlineReplies, TopLevelComposer } from "./InlineComposer";
import MessagesHeaderActions from "./MessagesHeaderActions";
import { CustomerOption, JobOption } from "./types";

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

type MessageRecord = {
  id: string;
  direction: string | null;
  channel: string | null;
  subject: string | null;
  body: string | null;
  status: string | null;
  external_id: string | null;
  customer_id: string | null;
  job_id: string | null;
  quote_id: string | null;
  invoice_id: string | null;
  via: string | null;
  created_at: string | null;
  sent_at: string | null;
};

type MessageRow = MessageRecord & {
  isCallFollowup: boolean;
  isJobOrQuoteMessage: boolean;
};

type MessagesPageSearchParams = {
  q?: string | string[] | undefined;
  [key: string]: string | string[] | undefined;
};

type MessageFilterMode = "all" | "followups" | "this-week";

function resolveMessageFilterMode(raw?: string | string[] | undefined): MessageFilterMode {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    return "all";
  }
  const normalized = value.toLowerCase();
  if (normalized === "followups") {
    return "followups";
  }
  if (normalized === "this-week") {
    return "this-week";
  }
  return "all";
}

type CallRow = {
  id: string;
  workspace_id: string;
  job_id: string | null;
  created_at: string | null;
  body: string | null;
  status: string | null;
};

type ShellCardProps = {
  title: string;
  subtitle: string;
  buttonLabel?: string;
  buttonHref?: string;
};

function renderShellCard({
  title,
  subtitle,
  buttonLabel = "Back to dashboard",
  buttonHref = "/dashboard",
}: ShellCardProps) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{subtitle}</p>
        <HbButton as="a" href={buttonHref} size="sm">
          {buttonLabel}
        </HbButton>
      </HbCard>
    </div>
  );
}

function renderSearchEmptyState(query: string) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-4">
        <div className="space-y-2">
          <h1 className="hb-card-heading text-lg font-semibold text-slate-100">
            {`No messages match "${query}"`}
          </h1>
          <p className="text-sm text-slate-400">
            Try adjusting filters or clearing the search. Follow-up drafts and outreach from the Calls workspace will appear here once you start contacting customers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <HbButton as={Link} href="/messages" size="sm" variant="ghost">
            Clear search
          </HbButton>
        </div>
      </HbCard>
    </div>
  );
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams?: Promise<MessagesPageSearchParams>;
}) {
  const searchParamsPromise = searchParams ?? Promise.resolve({});
  const resolvedSearchParams = await searchParamsPromise;
  const rawSearchQuery = (() => {
    const value = resolvedSearchParams?.q;
    if (Array.isArray(value)) {
      return value[0] ?? "";
    }
    return value ?? "";
  })();
  const trimmedSearchQuery = rawSearchQuery.trim();
  const isSearching = trimmedSearchQuery.length > 0;
  const filterMode = resolveMessageFilterMode(
    resolvedSearchParams?.filterMode ?? resolvedSearchParams?.filter,
  );
  const requestedCustomerIdRaw =
    resolvedSearchParams?.customerId ?? resolvedSearchParams?.customer_id;
  const normalizedCustomerId = Array.isArray(requestedCustomerIdRaw)
    ? requestedCustomerIdRaw[0] ?? null
    : requestedCustomerIdRaw ?? null;
  const initialCustomerId =
    typeof normalizedCustomerId === "string" && normalizedCustomerId.trim()
      ? normalizedCustomerId.trim()
      : null;
  const requestedJobIdRaw = resolvedSearchParams?.jobId ?? resolvedSearchParams?.job_id;
  const normalizedJobId = Array.isArray(requestedJobIdRaw)
    ? requestedJobIdRaw[0] ?? null
    : requestedJobIdRaw ?? null;
  const initialJobId =
    typeof normalizedJobId === "string" && normalizedJobId.trim() ? normalizedJobId.trim() : null;
  const rawComposeParam = resolvedSearchParams?.compose;
  const normalizedComposeParam = Array.isArray(rawComposeParam) ? rawComposeParam[0] : rawComposeParam;
  const composeOpen = normalizedComposeParam === "1";
  const rawOriginParam = resolvedSearchParams?.origin;
  const origin =
    Array.isArray(rawOriginParam) ? rawOriginParam[0] ?? null : rawOriginParam ?? null;
  const rawDraftBodyParam = resolvedSearchParams?.draftBody;
  const normalizedDraftBody = Array.isArray(rawDraftBodyParam)
    ? rawDraftBodyParam[0] ?? null
    : rawDraftBodyParam ?? null;
  const initialDraftBody =
    typeof normalizedDraftBody === "string" && normalizedDraftBody.trim()
      ? normalizedDraftBody.trim()
      : null;
  const messageFilterSubtitle =
    filterMode === "followups"
      ? "Showing follow-up messages across your workspace."
      : filterMode === "this-week"
      ? "Showing messages created this week."
      : "Recent messages across your jobs.";
  const filterChipClass = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition ${
      active
        ? "bg-slate-50 text-slate-950 shadow-sm shadow-slate-900/40"
        : "text-slate-400 hover:text-slate-100"
    }`;
  const buildFilterHref = (mode: MessageFilterMode) => {
    const params = new URLSearchParams();
    if (mode !== "all") {
      params.set("filterMode", mode);
      params.set("filter", mode);
    }
    if (trimmedSearchQuery) {
      params.set("q", trimmedSearchQuery);
    }
    const query = params.toString();
    return query ? `/messages?${query}` : "/messages";
  };
  const filterOptions: Array<{ label: string; mode: MessageFilterMode }> = [
    { label: "All messages", mode: "all" },
    { label: "Follow-up messages", mode: "followups" },
    { label: "This week", mode: "this-week" },
  ];

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[messages] Failed to init Supabase client:", error);
    return renderShellCard({
      title: "Something went wrong",
      subtitle: "We couldn’t load this page. Try again or go back.",
    });
  }

  let user;
  try {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    user = currentUser;
  } catch (error) {
    console.error("[messages] Failed to fetch auth user:", error);
  }

  if (!user) {
    redirect("/");
    return null;
  }

  let workspace;
  try {
    const workspaceResult = await getCurrentWorkspace({ supabase });
    workspace = workspaceResult.workspace;
  } catch (error) {
    console.error("[messages] Failed to resolve workspace:", error);
    return renderShellCard({
      title: "Something went wrong",
      subtitle: "We couldn’t load this page. Try again or go back.",
    });
  }

  if (!workspace) {
    return renderShellCard({
      title: "Something went wrong",
      subtitle: "We couldn’t load this page. Try again or go back.",
    });
  }

  let messages: MessageRecord[];
  try {
    const { data, error } = await supabase
      .from<MessageRecord>("messages")
      .select(
        `
          id,
          direction,
          channel,
          subject,
          body,
          status,
          external_id,
          customer_id,
          job_id,
          quote_id,
          invoice_id,
          via,
          created_at,
          sent_at
        `
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      throw error;
    }

    messages = data ?? [];
  } catch (error) {
    console.error("[messages] Failed to load messages:", error);
    return renderShellCard({
      title: "Something went wrong",
      subtitle: "We couldn’t load this page. Try again or go back.",
    });
  }

  if (messages.length === 0) {
    if (isSearching) {
      return renderSearchEmptyState(trimmedSearchQuery);
    }
    return renderShellCard({
      title: "No messages yet",
      subtitle:
        "There's nothing to show here yet. Follow-up drafts and outreach from the Calls workspace will appear here once you start contacting customers.",
      buttonLabel: "View jobs",
      buttonHref: "/jobs",
    });
  }

  let customers: CustomerOption[] = [];
  let jobs: JobOption[] = [];
  try {
    const { data: customerRows, error: customerError } = await supabase
      .from<CustomerOption>("customers")
      .select("id, name, phone")
      .eq("workspace_id", workspace.id)
      .order("name");
    if (customerError) {
      console.error("[messages] Failed to load customers:", customerError);
    } else {
      customers = customerRows ?? [];
    }
  } catch (error) {
    console.error("[messages] Failed to load customers:", error);
  }

  try {
    const { data: jobRows, error: jobError } = await supabase
      .from<JobOption>("jobs")
      .select("id, title, customer_id")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false });
    if (jobError) {
      console.error("[messages] Failed to load jobs:", jobError);
    } else {
      jobs = jobRows ?? [];
    }
  } catch (error) {
    console.error("[messages] Failed to load jobs:", error);
  }

  const jobFromSearch =
    initialJobId && jobs.length > 0 ? jobs.find((job) => job.id === initialJobId) : undefined;
  const topLevelCustomerId = initialCustomerId ?? jobFromSearch?.customer_id ?? null;

  const jobIds = Array.from(
    new Set(
      messages
        .map((message) => message.job_id)
        .filter((jobId): jobId is string => Boolean(jobId)),
    ),
  );

  const quoteCandidatesByJob: Record<string, { id: string; created_at: string | null }> = {};
  if (jobIds.length > 0) {
    const quoteLimit = Math.max(jobIds.length * 2, 30);
    const { data: quoteRows, error: quoteError } = await supabase
      .from("quotes")
      .select("id, job_id, created_at")
      .in("job_id", jobIds)
      .order("created_at", { ascending: false })
      .limit(quoteLimit);

    if (quoteError) {
      console.error("[messages] Failed to load quote candidates:", quoteError);
    } else {
      (quoteRows ?? []).forEach((quote) => {
        if (!quote.job_id) {
          return;
        }
        if (!quoteCandidatesByJob[quote.job_id]) {
          quoteCandidatesByJob[quote.job_id] = {
            id: quote.id,
            created_at: quote.created_at ?? null,
          };
        }
      });
    }
  }

  let calls: CallRow[] = [];
  if (jobIds.length > 0) {
    const { data: callRows, error: callError } = await supabase
      .from<CallRow>("calls")
      .select("id, workspace_id, job_id, created_at, status")
      .eq("workspace_id", workspace.id)
      .in("job_id", jobIds)
      .order("created_at", { ascending: false })
      .limit(50);

    if (callError) {
      console.error("[messages] Failed to load calls for follow-ups:", callError);
    } else {
      calls = callRows ?? [];
    }
  }

  const now = new Date();
  const callDescriptors: CallFollowupDescriptor[] = calls.map((call) => {
    const quoteCandidate =
      call.job_id && quoteCandidatesByJob[call.job_id]
        ? quoteCandidatesByJob[call.job_id]
        : null;
    const quoteId = quoteCandidate?.id ?? null;
    const quoteCreatedAt = quoteCandidate?.created_at ?? null;
    const quoteDate = quoteCreatedAt ? new Date(quoteCreatedAt) : null;
    const daysSinceQuote =
      quoteDate && !Number.isNaN(quoteDate.getTime())
        ? Math.floor((now.getTime() - quoteDate.getTime()) / ONE_DAY_MS)
        : null;
    const outcome = call.status?.trim() ?? null;
    return {
      id: call.id,
    job_id: call.job_id,
    quote_id: quoteId,
    created_at: call.created_at,
      outcome,
      daysSinceQuote,
      modelChannelSuggestion: null,
    };
  });

  const followupMessageRefs: FollowupMessageRef[] = messages.map((message) => ({
    id: message.id,
    job_id: message.job_id ?? null,
    quote_id: message.quote_id ?? null,
    invoice_id: message.invoice_id ?? null,
    channel: message.channel ?? null,
    via: message.via ?? null,
    created_at: message.created_at,
  }));

  const { messageIds: callFollowupMessageIds, messageToCallId: callIdByMessageId } =
    collectCallFollowupMessageIds({
    calls: callDescriptors,
    messages: followupMessageRefs,
  });

  const callIdByMessageIdRecord: Record<string, string> = {};
  callIdByMessageId.forEach((callId, messageId) => {
    if (callId) {
      callIdByMessageIdRecord[messageId] = callId;
    }
  });

  const messageRows: MessageRow[] = messages.map((message) => ({
    ...message,
    isCallFollowup: callFollowupMessageIds.has(message.id),
    isJobOrQuoteMessage: Boolean(message.job_id || message.quote_id),
  }));

  const followupMessageRows = messageRows.filter((message) => message.isCallFollowup);
  const {
    todayCount: followupsTodayCount,
    weekCount: followupsThisWeekCount,
    bounds: followupMessageBounds,
  } = computeFollowupMessageCounts(followupMessageRows, now);
  const weekAgoStart = followupMessageBounds.weekAgoStart;
  const followupTodayIds = followupMessageRows
    .filter((message) => {
      const parsed = parseFollowupMessageTimestamp(message);
      if (!parsed) return false;
      const time = parsed.getTime();
      return (
        time >= followupMessageBounds.todayStart.getTime() &&
        time < followupMessageBounds.tomorrowStart.getTime()
      );
    })
    .map((message) => message.id);
  const followupWeekIds = followupMessageRows
    .filter((message) => {
      const parsed = parseFollowupMessageTimestamp(message);
      if (!parsed) return false;
      return parsed.getTime() >= followupMessageBounds.weekAgoStart.getTime();
    })
    .map((message) => message.id);
  console.log("[messages-followups-dashboard-source]", {
    workspaceId: workspace.id,
    totalMessagesLoaded: messages.length,
    followupsTodayCount,
    followupsThisWeekCount,
    todayIds: followupTodayIds.slice(0, 5),
    weekIds: followupWeekIds.slice(0, 5),
  });

  const filteredMessages = messageRows.filter((message) => {
    if (filterMode === "followups") {
      return message.isCallFollowup;
    }
    if (filterMode === "this-week") {
      const parsed = parseFollowupMessageTimestamp(message);
      return parsed ? parsed.getTime() >= weekAgoStart.getTime() : false;
    }
    return true;
  });

  console.log("[messages-inline-debug]", {
    openComposerId: null,
    filteredCount: filteredMessages.length,
  });

  if (filterMode === "followups") {
    console.log("[messages-filter-mode]", {
      workspaceId: workspace.id,
      filterMode,
      filteredMessagesCount: filteredMessages.length,
      followupsTodayCount,
      followupsThisWeekCount,
    });
  }

  const filteredMessagesEmptyCopy =
    filterMode === "followups"
      ? isSearching
        ? "No follow-up messages match this search. Try 'All' to see everything."
        : "No follow-up messages match your current search or workspace data yet."
      : filterMode === "this-week"
      ? isSearching
        ? "No messages for this week match this search. Try 'All' or adjust your search."
        : "No messages were created this week."
      : "No messages match the current filters.";

  console.log("[messages-followup-summary]", {
    workspaceId: workspace.id,
    totalMessagesLoaded: messages.length,
    followupsTodayCount,
    followupsThisWeekCount,
    callFollowupMessageCount: callFollowupMessageIds.size,
    filteredMessagesCount: filteredMessages.length,
    filterMode,
  });

  if (filterMode === "followups" && origin === "dashboard-followups") {
    console.log("[messages-followups-dashboard-entry]", {
      workspaceId: workspace.id,
      filterMode,
      followupsTodayCount,
      followupsThisWeekCount,
    });
  }

  if (composeOpen) {
    console.log("[messages-compose-entry]", {
      workspaceId: workspace.id,
      filterMode,
      hasCustomerId: Boolean(initialCustomerId),
      hasJobId: Boolean(initialJobId),
      origin,
    });
    if (origin === "askbob") {
      console.log("[messages-compose-from-askbob-entry]", {
        workspaceId: workspace.id,
        hasCustomerId: Boolean(initialCustomerId),
        hasJobId: Boolean(initialJobId),
        hasDraftBody: Boolean(initialDraftBody),
      });
    }
  }

  console.log("[messages-index-summary]", {
    workspaceId: workspace.id,
    totalMessages: messages.length,
  });

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <HbCard className="space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="hb-heading-2 text-2xl font-semibold">Messages</h1>
            <p className="text-sm text-slate-400">{messageFilterSubtitle}</p>
            {filterMode === "followups" && (
              <p className="text-sm text-slate-400">
                Showing follow-up messages linked to recent calls or invoices.
              </p>
            )}
            {filterMode === "followups" && origin === "dashboard-followups" && (
              <p className="text-xs text-slate-500">
                You’re viewing follow-up messages surfaced from your dashboard.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {filterOptions.map((option) => {
                const isActive = option.mode === filterMode;
                return (
                  <Link key={option.mode} href={buildFilterHref(option.mode)} className={filterChipClass(isActive)}>
                    {option.label}
                  </Link>
                );
              })}
            </div>
            {origin === "calls-followup" && composeOpen && (
              <p className="mt-2 text-sm text-slate-400">
                You’re sending a follow-up SMS for a recent call.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <MessagesHeaderActions
              workspaceId={workspace.id}
              customers={customers}
              jobs={jobs}
              initialCustomerId={initialCustomerId}
              initialJobId={initialJobId}
              initialComposerOpen={composeOpen}
              initialComposerOrigin={origin}
              initialComposerBody={initialDraftBody}
            />
            <HbButton as="a" href="/messages" variant="ghost" size="sm">
              Back to messages
            </HbButton>
            <HbButton as="a" href="/customers" variant="secondary" size="sm">
              View customers
            </HbButton>
          </div>
        </header>

        <TopLevelComposer
          workspaceId={workspace.id}
          customerId={topLevelCustomerId}
          jobId={initialJobId}
        />

        {messageRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
            <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">At a glance</span>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] font-semibold text-slate-200">
                Follow-ups sent today: {followupsTodayCount}
              </span>
              <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] font-semibold text-slate-200">
                Follow-ups this week: {followupsThisWeekCount}
              </span>
            </div>
          </div>
        )}

        {filteredMessages.length === 0 ? (
          filterMode === "followups" && !isSearching ? (
            <div className="space-y-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-6 text-sm text-slate-400">
              <h2 className="hb-card-heading text-lg font-semibold text-slate-100">
                No follow-up messages yet.
              </h2>
              <p>
                Once you send follow-ups for calls or invoices, they’ll show up here for easy review.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-6 text-sm text-slate-400">
              {filteredMessagesEmptyCopy}
            </div>
          )
        ) : (
          <MessagesWithInlineReplies
            workspaceId={workspace.id}
            filteredMessages={filteredMessages}
            callIdByMessageId={callIdByMessageIdRecord}
          />
        )}
      </HbCard>
    </div>
  );
}
