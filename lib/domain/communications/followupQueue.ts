import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildFollowupDebugSnapshot,
  callIsFollowupQueueCandidate,
  computeFollowupDueInfo,
  deriveFollowupRecommendation,
  FollowupDueInfo,
  FollowupRecommendation,
} from "@/lib/domain/communications/followupRecommendations";
import {
  FollowupMessageRef,
  findMatchingFollowupMessage,
} from "@/lib/domain/communications/followupMessages";

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

function startOfToday(base?: Date) {
  const date = base ? new Date(base) : new Date();
  date.setHours(0, 0, 0, 0);
  date.setMilliseconds(0);
  return date;
}

export type FollowupCallRow = {
  id: string;
  workspace_id: string;
  job_id: string | null;
  customer_id: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  from_number: string | null;
  priority: string | null;
  needs_followup: boolean | null;
  attention_reason: string | null;
  ai_urgency: string | null;
  outcome: string | null;
  outcome_notes: string | null;
  outcome_recorded_at: string | null;
};

export type FollowupQueueCallDescriptor = {
  id: string;
  job_id: string | null;
  quote_id: string | null;
  created_at: string | null;
  outcome: string | null;
  daysSinceQuote: number | null;
  modelChannelSuggestion?: string | null;
};

export type FollowupEnrichedCallRow = FollowupCallRow & {
  followupRecommendation: FollowupRecommendation | null;
  followupDueInfo: FollowupDueInfo;
  hasMatchingFollowupToday: boolean;
  matchingFollowupMessageId: string | null;
};

export type FollowupQueueLoaderResult = {
  calls: FollowupCallRow[];
  callDescriptors: FollowupQueueCallDescriptor[];
  todayFollowupMessages: FollowupMessageRef[];
  allEnrichedCalls: FollowupEnrichedCallRow[];
  queueCalls: FollowupEnrichedCallRow[];
  queueCount: number;
  queueIds: string[];
};

export async function loadFollowupQueueData({
  supabase,
  workspaceId,
  jobId,
  limit = 200,
}: {
  supabase: SupabaseClient;
  workspaceId: string;
  jobId?: string | null;
  limit?: number;
}): Promise<FollowupQueueLoaderResult> {
  const callQuery = supabase
    .from<FollowupCallRow>("calls")
    .select(
      `
        id,
        workspace_id,
        job_id,
        customer_id,
        status,
        created_at,
        updated_at,
        from_number,
        priority,
        needs_followup,
        attention_reason,
        ai_urgency,
        outcome,
        outcome_notes,
        outcome_recorded_at
      `,
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (jobId) {
    callQuery.eq("job_id", jobId);
  }
  const { data, error: callError } = await callQuery;
  if (callError || !Array.isArray(data)) {
    console.error("[followup-queue-loader] Failed to load calls", {
      workspaceId,
      error: callError,
    });
    return {
      calls: [],
      callDescriptors: [],
      todayFollowupMessages: [],
      allEnrichedCalls: [],
      queueCalls: [],
      queueCount: 0,
      queueIds: [],
    };
  }
  const callRows = data;

  const jobIds = Array.from(
    new Set(
      callRows.map((call) => call.job_id).filter((jobId): jobId is string => Boolean(jobId)),
    ),
  );
  const quoteCandidatesByJob: Record<string, { id: string; created_at: string | null }> = {};
  if (jobIds.length > 0) {
    const quoteLimit = Math.max(30, jobIds.length * 3);
    const { data: quoteRows, error: quoteError } = await supabase
      .from("quotes")
      .select("id, job_id, created_at")
      .in("job_id", jobIds)
      .order("created_at", { ascending: false })
      .limit(quoteLimit);
    if (quoteError) {
      console.error("[followup-queue-loader] Failed to load quote candidates", quoteError);
    }
    (quoteRows ?? []).forEach((quote) => {
      if (!quote.job_id) {
        return;
      }
      if (!quoteCandidatesByJob[quote.job_id]) {
        quoteCandidatesByJob[quote.job_id] = { id: quote.id, created_at: quote.created_at ?? null };
      }
    });
  }

  const todayNow = new Date();
  const todayStart = startOfToday(todayNow);
  const { data: todayMessagesRows, error: todayMessagesError } = await supabase
    .from<FollowupMessageRef>("messages")
    .select("id, job_id, quote_id, invoice_id, channel, via, created_at")
    .eq("workspace_id", workspaceId)
    .gte("created_at", todayStart.toISOString())
    .in("channel", ["sms", "email", "phone"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (todayMessagesError) {
    console.error("[followup-queue-loader] Failed to load today's messages", todayMessagesError);
  }
  const todayFollowupMessages = todayMessagesRows ?? [];

  const callDescriptors: FollowupQueueCallDescriptor[] = [];
  const allEnrichedCalls: FollowupEnrichedCallRow[] = callRows.map((call) => {
    const quoteCandidate =
      call.job_id && quoteCandidatesByJob[call.job_id] ? quoteCandidatesByJob[call.job_id] : null;
    const quoteCreatedAt = quoteCandidate?.created_at ?? null;
    const quoteDate = quoteCreatedAt ? new Date(quoteCreatedAt) : null;
    const daysSinceQuote =
      quoteDate && !Number.isNaN(quoteDate.getTime())
        ? Math.floor((todayNow.getTime() - quoteDate.getTime()) / ONE_DAY_MS)
        : null;
    const normalizedOutcome = call.outcome?.trim() || call.status?.trim() || null;
    callDescriptors.push({
      id: call.id,
      job_id: call.job_id,
      quote_id: quoteCandidate?.id ?? null,
      created_at: call.created_at,
      outcome: normalizedOutcome,
      daysSinceQuote,
      modelChannelSuggestion: null,
    });
    const followupRecommendation =
      normalizedOutcome &&
      deriveFollowupRecommendation({
        outcome: normalizedOutcome,
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
      now: todayNow,
    });
    if (process.env.NODE_ENV !== "production") {
      console.log("[followup-reco]", {
        callId: call.id,
        jobId: call.job_id ?? null,
        quoteId: quoteCandidate?.id ?? call.quote_id ?? null,
        recommendedChannel,
        recommendedDelayDays: followupRecommendation?.recommendedDelayDays ?? null,
        shouldSkipFollowup: followupRecommendation?.shouldSkipFollowup ?? null,
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
      followupRecommendation,
      followupDueInfo,
      hasMatchingFollowupToday,
      matchingFollowupMessageId,
    };
  });

  const queueCalls = allEnrichedCalls.filter((call) =>
    callIsFollowupQueueCandidate({
      followupRecommendation: call.followupRecommendation,
      followupDueInfo: call.followupDueInfo,
      hasMatchingFollowupToday: call.hasMatchingFollowupToday,
    }),
  );

  const queueCount = queueCalls.length;
  const queueIds = queueCalls.map((call) => call.id);
  console.log("[followup-queue-loader]", {
    workspaceId,
    totalCallsLoaded: callRows.length,
    queueCount,
    queueIds: queueIds.slice(0, 10),
    queueSample: queueCalls
      .slice(0, 3)
      .map((call) =>
        buildFollowupDebugSnapshot(call.id, call.followupDueInfo, call.hasMatchingFollowupToday),
      ),
  });

  return {
    calls: callRows,
    callDescriptors,
    todayFollowupMessages,
    allEnrichedCalls,
    queueCalls,
    queueCount,
    queueIds,
  };
}
