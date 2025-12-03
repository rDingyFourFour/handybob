import type { FollowupRecommendation } from "./followups";

type DeriveFollowupRecommendationArgs = {
  outcome: string | null;
  daysSinceQuote: number | null;
  modelChannelSuggestion?: string | null;
};

type RecommendationCore = {
  recommendedChannel: FollowupRecommendation["recommendedChannel"];
  recommendedDelayLabel: string | null;
  recommendedTimingLabel: string;
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
      recommendedChannel: null,
      recommendedDelayLabel: "No follow-up recommended",
      recommendedTimingLabel: "No follow-up recommended",
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
      return { label: "Today", delayDays: 0 };
    }
    if (normalizedDays <= 7) {
      return { label: "Tomorrow", delayDays: 1 };
    }
    return { label: "In 2 days", delayDays: 2 };
  };

  const isLeftVoicemail =
    normalizedOutcome.includes("left voicemail") ||
    normalizedOutcome.includes("no answer");
  if (isLeftVoicemail) {
    const voicemailTiming = getLeftVoicemailTiming();
    return {
      recommendedChannel: modelChannel ?? "sms",
      recommendedDelayLabel: voicemailTiming.label,
      recommendedTimingLabel: voicemailTiming.label,
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
      normalizedDays !== null && normalizedDays > 3 ? "In 3 days" : "In 2 days";
    const delayDays = normalizedDays !== null && normalizedDays > 3 ? 3 : 2;
    return {
      recommendedChannel: channel,
      recommendedDelayLabel: delay,
      recommendedTimingLabel: delay,
      reason:
        "You already spoke with the customer; a short recap email works well as a follow-up.",
      recommendedDelayDays: delayDays,
      shouldSkipFollowup: false,
    };
  }

  if (normalizedOutcome.includes("call rescheduled")) {
    return {
      recommendedChannel: modelChannel ?? "call",
      recommendedDelayLabel: "At the rescheduled time",
      recommendedTimingLabel: "At the rescheduled time",
      reason:
        "The call is already rescheduled; the next step is simply to complete that call.",
      recommendedDelayDays: null,
      shouldSkipFollowup: false,
    };
  }

  const fallbackDelay =
    normalizedDays === null || normalizedDays <= 3 ? "Tomorrow" : "In a few days";
  const fallbackDelayDays =
    normalizedDays === null || normalizedDays <= 3 ? 1 : 3;
  return {
    recommendedChannel: modelChannel ?? "sms",
    recommendedDelayLabel: fallbackDelay,
    recommendedTimingLabel: fallbackDelay,
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
  recommendedTimingLabel: string;
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
    if (!channel) {
      return "No follow-up needed";
    }
    return "Send follow-up message";
  };
  const primaryActionLabel = formatPrimaryLabel(core.recommendedChannel);
  const secondaryActionLabel = core.recommendedTimingLabel
    ? `Timing suggestion: ${core.recommendedTimingLabel}`
    : undefined;
  const rationale = core.reason ?? "Follow up to keep things moving.";
  return {
    primaryActionLabel,
    secondaryActionLabel,
    recommendedChannel: core.recommendedChannel,
    rationale,
    recommendedDelayDays: core.recommendedDelayDays,
    recommendedTimingLabel: core.recommendedTimingLabel,
    shouldSkipFollowup: core.shouldSkipFollowup,
  };
}

export type FollowupDueStatus = "none" | "due-today" | "upcoming" | "overdue";

export type FollowupDueInfo = {
  dueDateISO: string | null;
  dueStatus: FollowupDueStatus;
  dueLabel: string;
  recommendedDelayDays: number | null;
};

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

type ParseDateInput = string | null | undefined;

function parseDate(value: ParseDateInput): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type FollowupBaseDateArgs = {
  quoteCreatedAt?: string | null;
  callCreatedAt?: string | null;
  now: Date;
};

export function getFollowupBaseDate({
  quoteCreatedAt,
  callCreatedAt,
  now,
}: FollowupBaseDateArgs): Date {
  const quoteDate = parseDate(quoteCreatedAt);
  if (quoteDate) {
    return quoteDate;
  }
  const callDate = parseDate(callCreatedAt);
  if (callDate) {
    return callDate;
  }
  return now;
}

type ComputeFollowupDueInfoArgs = {
  quoteCreatedAt?: string | null;
  callCreatedAt?: string | null;
  recommendation: NextActionSuggestion | null;
  now?: Date;
};

export function computeFollowupDueInfo({
  quoteCreatedAt,
  callCreatedAt,
  recommendation,
  now = new Date(),
}: ComputeFollowupDueInfoArgs): FollowupDueInfo {
  const effectiveNow = now;
  const normalizedCallDate = parseDate(callCreatedAt);
  const hasValidCallDate = normalizedCallDate !== null;
  // TODO: once calls expose a follow_up_state column (e.g. none/due/done/snoozed), this module
  // should accept that state so callers can short-circuit “no follow-up due” for done/snoozed calls
  // without relying solely on dueStatus calculations.
  if (!recommendation || recommendation.recommendedDelayDays == null) {
    const info: FollowupDueInfo = {
      dueDateISO: hasValidCallDate ? normalizedCallDate!.toISOString() : null,
      dueStatus: "none",
      dueLabel: "No follow-up due",
      recommendedDelayDays: recommendation?.recommendedDelayDays ?? null,
    };
    if (process.env.NODE_ENV !== "production") {
      console.log("[followup-due-info]", {
        quoteCreatedAt,
        callCreatedAt,
        recommendedDelayDays: info.recommendedDelayDays,
        dueStatus: info.dueStatus,
        dueLabel: info.dueLabel,
      });
    }
    return info;
  }

  const baseDate = getFollowupBaseDate({
    quoteCreatedAt,
    callCreatedAt,
    now: effectiveNow,
  });

  const dueDate = new Date(baseDate.getTime() + recommendation.recommendedDelayDays * ONE_DAY_MS);
  if (Number.isNaN(dueDate.getTime())) {
    const info: FollowupDueInfo = {
      dueDateISO: null,
      dueStatus: "none",
      dueLabel: "No follow-up due",
      recommendedDelayDays: recommendation.recommendedDelayDays,
    };
    if (process.env.NODE_ENV !== "production") {
      console.log("[followup-due-info]", {
        quoteCreatedAt,
        callCreatedAt,
        recommendedDelayDays: info.recommendedDelayDays,
        dueStatus: info.dueStatus,
        dueLabel: info.dueLabel,
      });
    }
    return info;
  }

  const diffMs = Math.floor((dueDate.getTime() - effectiveNow.getTime()) / ONE_DAY_MS);
  let dueStatus: FollowupDueStatus;
  let dueLabel: string;
  if (diffMs < 0) {
    dueStatus = "overdue";
    dueLabel = "Overdue";
  } else if (diffMs === 0) {
    dueStatus = "due-today";
    dueLabel = "Due today";
  } else if (diffMs === 1) {
    dueStatus = "upcoming";
    dueLabel = "Due tomorrow";
  } else {
    dueStatus = "upcoming";
    dueLabel = `Due in ${diffMs} days`;
  }

  const info: FollowupDueInfo = {
    dueDateISO: dueDate.toISOString(),
    dueStatus,
    dueLabel,
    recommendedDelayDays: recommendation.recommendedDelayDays,
  };
  if (process.env.NODE_ENV !== "production") {
    console.log("[followup-due-info]", {
      quoteCreatedAt,
      callCreatedAt,
      recommendedDelayDays: info.recommendedDelayDays,
      dueStatus: info.dueStatus,
      dueLabel: info.dueLabel,
    });
  }
  return info;
}

export function isActionableFollowupDue(status: FollowupDueStatus | null | undefined): boolean {
  return status === "overdue" || status === "due-today";
}
