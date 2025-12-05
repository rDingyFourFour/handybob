type FollowupChannel = "sms" | "email" | "call" | null;

export type FollowupRecommendation = {
  recommendedChannel: FollowupChannel;
  primaryActionLabel: string;
  secondaryActionLabel: string | null;
  rationale: string;
  recommendedDelayDays: number | null;
  recommendedTimingLabel: string;
  shouldSkipFollowup: boolean;
  recommendedDelayLabel: string | null;
};

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

type InvoiceAutomationArgs = {
  invoiceStatus?: string | null;
  daysOverdue?: number | null;
};

export function deriveInvoiceCollectionsRecommendation({
  invoiceStatus,
  daysOverdue,
}: InvoiceAutomationArgs): NextActionSuggestion {
  const normalizedStatus = invoiceStatus?.trim().toLowerCase() ?? "";
  const overdueDays = typeof daysOverdue === "number" ? daysOverdue : 0;

  if (normalizedStatus === "paid" || normalizedStatus === "voided" || normalizedStatus === "void") {
    return {
      primaryActionLabel: "No follow-up needed",
      secondaryActionLabel: "Timing suggestion: —",
      recommendedChannel: null,
      rationale: "The invoice is resolved, so no further follow-up is required.",
      recommendedDelayDays: null,
      recommendedTimingLabel: "No follow-up needed",
      shouldSkipFollowup: true,
    };
  }

  if (normalizedStatus === "overdue" || overdueDays > 0) {
    return {
      primaryActionLabel: "Send friendly payment reminder",
      secondaryActionLabel: "Timing suggestion: Today",
      recommendedChannel: "email",
      rationale: "The invoice is overdue, so a gentle email reminder makes sense.",
      recommendedDelayDays: 0,
      recommendedTimingLabel: "Today",
      shouldSkipFollowup: false,
    };
  }

  return {
    primaryActionLabel: "Schedule a reminder before the due date",
    secondaryActionLabel: "Timing suggestion: Before due date",
    recommendedChannel: "email",
    rationale: "The invoice is due soon; plan a reminder before it becomes overdue.",
    recommendedDelayDays: 0,
    recommendedTimingLabel: "Before due date",
    shouldSkipFollowup: false,
  };
}

export function deriveFollowupRecommendation({
  outcome,
  daysSinceQuote,
  modelChannelSuggestion,
}: DeriveFollowupRecommendationArgs): FollowupRecommendation | null {
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
  const secondaryActionLabel =
    core.shouldSkipFollowup || !core.recommendedTimingLabel
      ? null
      : `Timing suggestion: ${core.recommendedTimingLabel}`;
  const rationale = core.reason ?? "Follow up to keep things moving.";
  return {
    primaryActionLabel,
    secondaryActionLabel,
    recommendedChannel: core.recommendedChannel,
    rationale,
    recommendedDelayDays: core.recommendedDelayDays,
    recommendedTimingLabel: core.recommendedTimingLabel,
    shouldSkipFollowup: core.shouldSkipFollowup,
    recommendedDelayLabel: core.recommendedDelayLabel,
  };
}

export type InvoiceFollowupRecommendation = {
  primaryActionLabel: string;
  secondaryActionLabel?: string;
  recommendedChannel: "email" | "sms";
  rationale: string;
  recommendedDelayDays: number | null;
  recommendedTimingLabel: string;
  shouldSkipFollowup: boolean;
};

type InvoiceFollowupMetadata = {
  invoiceId?: string | null;
  jobId?: string | null;
  customerId?: string | null;
};

type DeriveInvoiceFollowupRecommendationArgs = {
  outcome: string | null;
  daysSinceInvoiceSent: number | null;
  status: string | null;
  metadata?: InvoiceFollowupMetadata;
};

export function deriveInvoiceFollowupRecommendation({
  outcome,
  daysSinceInvoiceSent,
  status,
  metadata,
}: DeriveInvoiceFollowupRecommendationArgs): InvoiceFollowupRecommendation {
  const normalizedStatus = status?.trim().toLowerCase() ?? "";
  const normalizedOutcome = outcome?.trim().toLowerCase() ?? "invoice_sent";
  let primaryActionLabel = "No follow-up needed";
  let rationale =
    normalizedStatus === "paid"
      ? "Invoice is marked as paid, so no further follow-up is needed."
      : "Invoice is still a draft, so it is not ready for a follow-up.";
  let recommendedDelayDays: number | null = null;
  let recommendedTimingLabel = "No follow-up recommended";
  let shouldSkipFollowup = false;

  if (normalizedStatus === "paid") {
    shouldSkipFollowup = true;
  } else if (normalizedStatus === "draft") {
    shouldSkipFollowup = true;
  } else if (normalizedStatus === "overdue") {
    primaryActionLabel = "Send payment reminder";
    rationale = "The invoice is overdue; follow up with the customer today.";
    recommendedDelayDays = 0;
    recommendedTimingLabel = "Today";
  } else if (
    normalizedStatus === "sent" &&
    typeof daysSinceInvoiceSent === "number" &&
    daysSinceInvoiceSent >= 3
  ) {
    primaryActionLabel = "Send gentle reminder";
    rationale = "It’s been several days since this invoice was sent.";
    recommendedDelayDays = 0;
    recommendedTimingLabel = "Today";
  } else {
    primaryActionLabel = "Schedule follow-up";
    rationale = "Give the customer a few days before following up.";
    recommendedDelayDays = 3;
    recommendedTimingLabel = "Later this week";
  }

  const recommendation: InvoiceFollowupRecommendation = {
    primaryActionLabel,
    secondaryActionLabel: shouldSkipFollowup
      ? undefined
      : `Timing: ${recommendedTimingLabel}`,
    recommendedChannel: "email",
    rationale,
    recommendedDelayDays,
    recommendedTimingLabel,
    shouldSkipFollowup,
  };

  if (process.env.NODE_ENV !== "production") {
    console.log("[invoice-followup-reco]", {
      invoiceId: metadata?.invoiceId ?? null,
      jobId: metadata?.jobId ?? null,
      customerId: metadata?.customerId ?? null,
      status: normalizedStatus,
      outcome: normalizedOutcome,
      daysSinceInvoiceSent,
      recommendation,
    });
  }

  return recommendation;
}

export type FollowupDueStatus = "none" | "due-today" | "scheduled" | "overdue";

export type FollowupDueInfo = {
  baseDate: string | null;
  dueDate: string | null;
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

type ComputeFollowupDueInfoArgs = {
  quoteCreatedAt?: string | null;
  callCreatedAt?: string | null;
  invoiceDueAt?: string | null;
  recommendedDelayDays?: number | null;
  now?: Date;
};

export function computeFollowupDueInfo({
  quoteCreatedAt,
  callCreatedAt,
  invoiceDueAt,
  recommendedDelayDays,
  now,
}: ComputeFollowupDueInfoArgs): FollowupDueInfo {
  const effectiveNow = now ? new Date(now.getTime()) : new Date();
  const normalizedDelay =
    typeof recommendedDelayDays === "number" && Number.isFinite(recommendedDelayDays)
      ? recommendedDelayDays
      : null;
  const parsedQuoteDate = parseDate(quoteCreatedAt);
  const parsedCallDate = parseDate(callCreatedAt);
  const parsedInvoiceDueDate = parseDate(invoiceDueAt);

  const baseDateCandidate =
    parsedInvoiceDueDate ?? parsedQuoteDate ?? parsedCallDate ?? effectiveNow;
  const baseDate = baseDateCandidate ? new Date(baseDateCandidate.getTime()) : null;
  const baseDateIso = baseDate ? baseDate.toISOString() : null;

  let dueDate: Date | null = null;
  if (normalizedDelay !== null && baseDate) {
    dueDate = new Date(baseDate.getTime() + normalizedDelay * ONE_DAY_MS);
    if (Number.isNaN(dueDate.getTime())) {
      dueDate = null;
    }
  }

  let dueStatus: FollowupDueStatus;
  let dueLabel: string;

  if (normalizedDelay === null || !dueDate) {
    dueStatus = "none";
    dueLabel = "No follow-up due";
  } else {
    const diffMs = Math.floor((dueDate.getTime() - effectiveNow.getTime()) / ONE_DAY_MS);
    if (diffMs < 0) {
      dueStatus = "overdue";
      dueLabel = "Overdue";
    } else if (diffMs === 0) {
      dueStatus = "due-today";
      dueLabel = "Due today";
    } else if (diffMs === 1) {
      dueStatus = "scheduled";
      dueLabel = "Due tomorrow";
    } else {
      dueStatus = "scheduled";
      dueLabel = `Due in ${diffMs} days`;
    }
  }

  const info: FollowupDueInfo = {
    baseDate: baseDateIso,
    dueDate: dueDate ? dueDate.toISOString() : null,
    dueStatus,
    dueLabel,
    recommendedDelayDays: normalizedDelay,
  };

  if (process.env.NODE_ENV !== "production") {
    console.log("[followup-due-info]", {
      quoteCreatedAt,
      callCreatedAt,
      invoiceDueAt,
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

export function getInvoiceSentDate({
  issuedAt,
  createdAt,
}: {
  issuedAt?: string | null;
  createdAt?: string | null;
}): string | null {
  return issuedAt ?? createdAt ?? null;
}

export function getInvoiceFollowupBaseDate({
  dueAt,
  issuedAt,
  createdAt,
}: {
  dueAt?: string | null;
  issuedAt?: string | null;
  createdAt?: string | null;
}): string | null {
  return dueAt ?? issuedAt ?? createdAt ?? null;
}

export function calculateDaysSinceDate(value?: string | null): number | null {
  const parsed = parseDate(value);
  if (!parsed) {
    return null;
  }
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs <= 0) {
    return 0;
  }
  return Math.floor(diffMs / ONE_DAY_MS);
}
