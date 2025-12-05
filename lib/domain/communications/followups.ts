"use server";

import type { FollowupRecommendation } from "./followupRecommendations";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SmartFollowupActionResponse } from "@/app/(app)/quotes/[id]/followupAiActions";

export type SmartFollowupFromCallSummaryInput = {
  supabaseClient: SupabaseClient;
  workspaceId: string;
  jobId: string;
  quoteId: string;
  summaryNote: string;
  outcome: string | null;
  daysSinceQuote?: number | null;
};

export async function smartFollowupFromCallSummary({
  supabaseClient,
  summaryNote,
  outcome,
  workspaceId,
  jobId,
  quoteId,
  daysSinceQuote,
}: SmartFollowupFromCallSummaryInput): Promise<SmartFollowupActionResponse> {
  void supabaseClient;
  const normalizedSummary = summaryNote?.trim() ?? "";
  const composedDescription = [
    normalizedSummary,
    outcome ? `Outcome: ${outcome.replace(/_/g, " ")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const { smartFollowupFromQuote } = await import(
    "@/app/(app)/quotes/[id]/followupAiActions"
  );
  const response = await smartFollowupFromQuote({
    description: composedDescription,
    quoteId,
    jobId,
    workspaceId,
    status: null,
    totalAmount: null,
    customerName: null,
    daysSinceQuote: typeof daysSinceQuote === "number" ? daysSinceQuote : null,
    outcome,
  });

  return response;
}

export type { FollowupRecommendation };

type DeriveFollowupRecommendationArgs = {
  outcome: string | null;
  daysSinceQuote: number | null;
  modelChannelSuggestion?: string | null;
};

type RecommendationCore = {
  recommendedChannel: FollowupRecommendation["recommendedChannel"];
  recommendedDelayLabel: string | null;
  reason: string | null;
};

function normalizeFollowupRecommendationArgs({
  outcome,
  daysSinceQuote,
  modelChannelSuggestion,
}: DeriveFollowupRecommendationArgs): {
  normalizedOutcome: string;
  normalizedDays: number | null;
  modelChannel: FollowupRecommendation["recommendedChannel"] | null;
} {
  const normalizedOutcome = outcome?.trim().toLowerCase() ?? "";
  const normalizedModelChannel =
    typeof modelChannelSuggestion === "string"
      ? modelChannelSuggestion.trim().toLowerCase()
      : null;
  const validChannels: Array<FollowupRecommendation["recommendedChannel"]> = [
    "sms",
    "email",
    "call",
  ];
  const modelChannel = normalizedModelChannel
    ? (validChannels.includes(
        normalizedModelChannel as FollowupRecommendation["recommendedChannel"],
      )
        ? (normalizedModelChannel as FollowupRecommendation["recommendedChannel"])
        : null)
    : null;
  const normalizedDays =
    typeof daysSinceQuote === "number" && Number.isFinite(daysSinceQuote)
      ? daysSinceQuote
      : null;
  return { normalizedOutcome, normalizedDays, modelChannel };
}

function buildRecommendationCore(
  args: DeriveFollowupRecommendationArgs,
): RecommendationCore {
  const { normalizedOutcome, normalizedDays, modelChannel } =
    normalizeFollowupRecommendationArgs(args);

  const getLeftVoicemailDelay = (): string => {
    if (normalizedDays === null || normalizedDays <= 1) {
      return "later today";
    }
    if (normalizedDays <= 7) {
      return "tomorrow";
    }
    return "in 2 days";
  };

  const isLeftVoicemail =
    normalizedOutcome.includes("left voicemail") ||
    normalizedOutcome.includes("no answer");
  if (isLeftVoicemail) {
    return {
      recommendedChannel: modelChannel ?? "sms",
      recommendedDelayLabel: getLeftVoicemailDelay(),
      reason:
        "You left a voicemail, so a quick SMS is usually the most effective follow-up.",
    };
  }

  const isTalkedToCustomer = normalizedOutcome.includes("talked to customer");
  if (isTalkedToCustomer) {
    const channel =
      normalizedDays !== null && (normalizedDays === 0 || normalizedDays === 1)
        ? "email"
        : modelChannel ?? "email";
    const delay =
      normalizedDays !== null && normalizedDays > 3 ? "in 3 days" : "tomorrow";
    return {
      recommendedChannel: channel,
      recommendedDelayLabel: delay,
      reason:
        "You already spoke with the customer; a short recap email works well as a follow-up.",
    };
  }

  if (normalizedOutcome.includes("call rescheduled")) {
    return {
      recommendedChannel: modelChannel ?? "call",
      recommendedDelayLabel: "at the rescheduled time",
      reason:
        "The call is already rescheduled; the next step is simply to complete that call.",
    };
  }

  const fallbackDelay =
    normalizedDays === null || normalizedDays <= 3 ? "tomorrow" : "in a few days";
  return {
    recommendedChannel: modelChannel ?? "sms",
    recommendedDelayLabel: fallbackDelay,
    reason: "Based on this outcome, a simple follow-up message is recommended.",
  };
}

export async function deriveFollowupRecommendationMetadata({
  outcome,
  daysSinceQuote,
  modelChannelSuggestion,
}: DeriveFollowupRecommendationArgs): Promise<FollowupRecommendation> {
  return buildRecommendationCore({
    outcome,
    daysSinceQuote,
    modelChannelSuggestion,
  });
}


export type NextActionSuggestion = {
  type: "call_again" | "send_sms" | "send_email" | "close_lost" | "do_nothing";
  label: string;
  reason: string;
  timingHint?: string;
  channelHint?: "phone" | "sms" | "email";
};

export async function smartNextActionFromCallSummary({
  supabaseClient,
  workspaceId: _workspaceId,
  jobId: _jobId,
  quoteId: _quoteId,
  outcome,
  summaryNote,
}: SmartFollowupFromCallSummaryInput): Promise<NextActionSuggestion | null> {
  void supabaseClient;
  // CHANGE: Silencing unused identifier warnings until these IDs are required.
  void _workspaceId;
  void _jobId;
  void _quoteId;
  const normalizedOutcome = outcome?.toLowerCase() ?? "";
  const normalizedNote = summaryNote?.trim() ?? "";

  if (normalizedOutcome.includes("call_rescheduled")) {
    return {
      type: "call_again",
      label: "Call again in 2 days",
      reason: "Customer asked for a follow-up, so try reaching out again shortly.",
      timingHint: "in 2 days",
      channelHint: "phone",
    };
  }
  if (normalizedOutcome.includes("left_voicemail") || normalizedOutcome.includes("no_answer")) {
    return {
      type: "send_sms",
      label: "Send a quick SMS recap",
      reason: "We weren’t able to reach them, so a text recap keeps things moving.",
      timingHint: "later today",
      channelHint: "sms",
    };
  }
  if (normalizedOutcome.includes("talked_to_customer") && normalizedNote.toLowerCase().includes("ready")) {
    return {
      type: "send_email",
      label: "Confirm details via email",
      reason: "Customer sounds ready; summarize next steps via email.",
      channelHint: "email",
    };
  }
  if (normalizedOutcome.includes("lost") || normalizedOutcome.includes("call_rescheduled")) {
    return {
      type: "close_lost",
      label: "Document as lost/paused",
      reason: "Outcome suggests we should close or pause this quote.",
    };
  }
  if (normalizedNote) {
    return {
      type: "call_again",
      label: "Follow up with a quick call",
      reason: `Summary says: ${normalizedNote}`,
      channelHint: "phone",
    };
  }
  return {
    type: "do_nothing",
    label: "No immediate action",
    reason: "Summary didn't include a clear next step.",
  };
}
