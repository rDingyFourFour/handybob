import type { FollowupRecommendation } from "./followups";

type DeriveFollowupRecommendationArgs = {
  outcome: string | null;
  daysSinceQuote: number | null;
  modelChannelSuggestion?: string | null;
};

type RecommendationCore = {
  recommendedChannel: FollowupRecommendation["recommendedChannel"];
  recommendedDelayLabel: string | null;
  reason: string | null;
  recommendedDelayDays: number | null;
  shouldSkipFollowup: boolean;
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

  const winOutcomeKeywords = ["job won", "booked", "converted"];
  const skipOutcomeKeywords = ["not interested", "do not contact"];
  const isWinOutcome = winOutcomeKeywords.some((keyword) =>
    normalizedOutcome.includes(keyword),
  );
  const isDoNotContactOutcome = skipOutcomeKeywords.some((keyword) =>
    normalizedOutcome.includes(keyword),
  );
  if (isWinOutcome || isDoNotContactOutcome) {
    const reason = isDoNotContactOutcome
      ? "Outcome suggests we should stop contacting this customer."
      : "Outcome indicates the job was booked or converted.";
    return {
      recommendedChannel: modelChannel ?? "call",
      recommendedDelayLabel: null,
      reason,
      recommendedDelayDays: null,
      shouldSkipFollowup: true,
    };
  }

  const getLeftVoicemailTiming = (): {
    label: string;
    delayDays: number;
  } => {
    if (normalizedDays === null || normalizedDays <= 1) {
      return { label: "later today", delayDays: 0 };
    }
    if (normalizedDays <= 7) {
      return { label: "tomorrow", delayDays: 1 };
    }
    return { label: "in 2 days", delayDays: 2 };
  };

  const isLeftVoicemail =
    normalizedOutcome.includes("left voicemail") ||
    normalizedOutcome.includes("no answer");
  if (isLeftVoicemail) {
    const voicemailTiming = getLeftVoicemailTiming();
    return {
      recommendedChannel: modelChannel ?? "sms",
      recommendedDelayLabel: voicemailTiming.label,
      reason:
        "You left a voicemail, so a quick SMS is usually the most effective follow-up.",
      recommendedDelayDays: voicemailTiming.delayDays,
      shouldSkipFollowup: false,
    };
  }

  const isTalkedToCustomer = normalizedOutcome.includes("talked to customer");
  if (isTalkedToCustomer) {
    const channel =
      normalizedDays !== null && (normalizedDays === 0 || normalizedDays === 1)
        ? "email"
        : modelChannel ?? "email";
    const delay =
      normalizedDays !== null && normalizedDays > 3 ? "in 3 days" : "in 2 days";
    const delayDays =
      normalizedDays !== null && normalizedDays > 3 ? 3 : 2;
    return {
      recommendedChannel: channel,
      recommendedDelayLabel: delay,
      reason:
        "You already spoke with the customer; a short recap email works well as a follow-up.",
      recommendedDelayDays: delayDays,
      shouldSkipFollowup: false,
    };
  }

  if (normalizedOutcome.includes("call rescheduled")) {
    return {
      recommendedChannel: modelChannel ?? "call",
      recommendedDelayLabel: "at the rescheduled time",
      reason:
        "The call is already rescheduled; the next step is simply to complete that call.",
      recommendedDelayDays: null,
      shouldSkipFollowup: false,
    };
  }

  const fallbackDelay =
    normalizedDays === null || normalizedDays <= 3 ? "tomorrow" : "in a few days";
  const fallbackDelayDays =
    normalizedDays === null || normalizedDays <= 3 ? 1 : 3;
  return {
    recommendedChannel: modelChannel ?? "sms",
    recommendedDelayLabel: fallbackDelay,
    reason: "Based on this outcome, a simple follow-up message is recommended.",
    recommendedDelayDays: fallbackDelayDays,
    shouldSkipFollowup: false,
  };
}

export type NextActionSuggestion = {
  primaryActionLabel: string;
  secondaryActionLabel?: string;
  recommendedChannel: FollowupRecommendation["recommendedChannel"];
  rationale: string;
  recommendedDelayDays: number | null;
  shouldSkipFollowup: boolean;
};

export function deriveFollowupRecommendation({
  outcome,
  daysSinceQuote,
  modelChannelSuggestion,
}: DeriveFollowupRecommendationArgs): NextActionSuggestion | null {
  if (!outcome && daysSinceQuote === null && !modelChannelSuggestion) {
    return null;
  }
  const core = buildRecommendationCore({
    outcome,
    daysSinceQuote,
    modelChannelSuggestion,
  });
  const formatPrimaryLabel = (channel: FollowupRecommendation["recommendedChannel"]) => {
    if (channel === "sms") {
      return "Send follow-up SMS";
    }
    if (channel === "email") {
      return "Send follow-up email";
    }
    if (channel === "call") {
      return "Call the customer";
    }
    return "Send follow-up message";
  };
  const primaryActionLabel = formatPrimaryLabel(core.recommendedChannel);
  const secondaryActionLabel = core.recommendedDelayLabel
    ? `Timing suggestion: ${core.recommendedDelayLabel}`
    : undefined;
  const rationale = core.reason ?? "Follow up to keep things moving.";
  return {
    primaryActionLabel,
    secondaryActionLabel,
    recommendedChannel: core.recommendedChannel,
    rationale,
    recommendedDelayDays: core.recommendedDelayDays,
    shouldSkipFollowup: core.shouldSkipFollowup,
  };
}
