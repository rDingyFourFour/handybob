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
} from "@/lib/domain/communications/followupMessages";

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

function parseTimestampValue(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatShortDate(value: string | null) {
  const parsed = parseTimestampValue(value);
  if (!parsed) return "—";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function parseMessageTimestamp(message: Pick<MessageRow, "created_at" | "sent_at">) {
  return parseTimestampValue(message.created_at ?? message.sent_at ?? null);
}

function isMessageFromThisWeek(message: MessageRow, weekAgoStart: Date) {
  const parsed = parseMessageTimestamp(message);
  if (!parsed) {
    return false;
  }
  return parsed.getTime() >= weekAgoStart.getTime();
}

const bodyPreview = (body: string | null) => {
  const trimmed = body?.trim() ?? "";
  if (!trimmed) return "No preview available";
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed;
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
  const filterMode = resolveMessageFilterMode(resolvedSearchParams?.filter);
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
      params.set("filter", mode);
    }
    if (trimmedSearchQuery) {
      params.set("q", trimmedSearchQuery);
    }
    const query = params.toString();
    return query ? `/messages?${query}` : "/messages";
  };
  const filterOptions: Array<{ label: string; mode: MessageFilterMode }> = [
    { label: "All", mode: "all" },
    { label: "Follow-ups", mode: "followups" },
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

  const messageRows: MessageRow[] = messages.map((message) => ({
    ...message,
    isCallFollowup: callFollowupMessageIds.has(message.id),
    isJobOrQuoteMessage: Boolean(message.job_id || message.quote_id),
  }));

  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const weekAgoStart = new Date(todayStart);
  weekAgoStart.setDate(weekAgoStart.getDate() - 6);

  let followupsTodayCount = 0;
  let followupsThisWeekCount = 0;
  for (const row of messageRows) {
    if (!row.isCallFollowup) {
      continue;
    }
    const parsed = parseMessageTimestamp(row);
    if (!parsed) {
      continue;
    }
    if (
      parsed.getUTCFullYear() === now.getUTCFullYear() &&
      parsed.getUTCMonth() === now.getUTCMonth() &&
      parsed.getUTCDate() === now.getUTCDate()
    ) {
      followupsTodayCount += 1;
    }
    if (parsed.getTime() >= weekAgoStart.getTime()) {
      followupsThisWeekCount += 1;
    }
  }

  const filteredMessages = messageRows.filter((message) => {
    if (filterMode === "followups") {
      return message.isCallFollowup;
    }
    if (filterMode === "this-week") {
      return isMessageFromThisWeek(message, weekAgoStart);
    }
    return true;
  });

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

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <HbCard className="space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="hb-heading-2 text-2xl font-semibold">Messages</h1>
            <p className="text-sm text-slate-400">{messageFilterSubtitle}</p>
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
          </div>
          <div className="flex flex-wrap gap-2">
            <HbButton as="a" href="/messages" variant="ghost" size="sm">
              Back to messages
            </HbButton>
            <HbButton as="a" href="/customers" variant="secondary" size="sm">
              View customers
            </HbButton>
          </div>
        </header>

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
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-6 text-sm text-slate-400">
            {filteredMessagesEmptyCopy}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMessages.map((message) => {
              const subject = message.subject?.trim() || "(no subject)";
              const preview = bodyPreview(message.body);
              const statusLabel = message.status ?? "Unknown";
              const channelLabel =
                typeof message.channel === "string" && message.channel.length > 0
                  ? `${message.channel.charAt(0).toUpperCase()}${message.channel.slice(1)}`
                  : "—";
              const timestamp = formatDate(message.sent_at ?? message.created_at);
              const relatedShortDate = formatShortDate(message.created_at ?? message.sent_at);
              const jobContextLabel = message.job_id ? `#${message.job_id.slice(0, 8)}` : null;
              const relatedStub = jobContextLabel
                ? `Job • ${jobContextLabel}`
                : message.isCallFollowup
                ? `Call • ${relatedShortDate}`
                : `Message • ${relatedShortDate}`;
              const callIdForMessage = callIdByMessageId.get(message.id) ?? null;
              const primaryActionClass =
                "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition bg-slate-50 text-slate-950 shadow-sm shadow-slate-900/40";
              const secondaryActionClass =
                "rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition text-slate-400 hover:border-slate-600";

              return (
                <article
                  key={message.id}
                  className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4 transition hover:border-slate-600"
                >
                  <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Subject:</p>
                          <p className="text-sm font-semibold text-slate-100">{subject}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {message.isCallFollowup && (
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200">
                              Call follow-up
                            </span>
                          )}
                          {!message.isCallFollowup && message.isJobOrQuoteMessage && (
                            <span className="rounded-full border border-slate-700/60 bg-slate-900/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                              Job/quote message
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Body:</p>
                        <p className="text-sm text-slate-500">{preview}</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-slate-400">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Status: {statusLabel}</p>
                        {message.isCallFollowup && (
                          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200">
                            Follow-up
                          </span>
                        )}
                      </div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Channel: {channelLabel}</p>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Sent: {timestamp}</p>
                      <p className="text-[11px] text-slate-500">
                        Related: <span className="text-slate-400">{relatedStub}</span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/messages/${message.id}`} className={primaryActionClass}>
                          View message
                        </Link>
                        {message.job_id && (
                          <Link href={`/jobs/${message.job_id}`} className={secondaryActionClass}>
                            Open job
                          </Link>
                        )}
                        {callIdForMessage && (
                          <Link href={`/calls/${callIdForMessage}`} className={secondaryActionClass}>
                            Open call
                          </Link>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-sky-300">
                        {message.job_id ? (
                          <span className="flex items-center gap-1">
                            <span className="text-slate-500">Job:</span>
                            <Link href={`/jobs/${message.job_id}`} className="text-sky-300 hover:text-sky-200">
                              View job
                            </Link>
                          </span>
                        ) : null}
                        {message.customer_id ? (
                          <span className="flex items-center gap-1">
                            <span className="text-slate-500">Customer:</span>
                            <Link
                              href={`/customers/${message.customer_id}`}
                              className="text-sky-300 hover:text-sky-200"
                            >
                              View customer
                            </Link>
                          </span>
                        ) : null}
                        {!message.job_id && !message.customer_id && (
                          <span className="text-slate-500">No linked context</span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </HbCard>
    </div>
  );
}
