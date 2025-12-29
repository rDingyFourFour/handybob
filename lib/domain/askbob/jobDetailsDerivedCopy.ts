import { formatFriendlyDateTime } from "@/utils/timeline/formatters";
import { assertBobTone, normalizeBobCtaLabel, normalizeBobStatus } from "@/lib/domain/copy/bobVoice";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import type {
  CallSummarySignals,
} from "@/lib/domain/askbob/callHistory";
import { describeCallOutcome } from "@/lib/domain/askbob/callHistory";
import type {
  JobProgressStep,
  NextStepResult,
  NextStepStatusHints,
} from "@/lib/domain/askbob/nextStep";

const PROGRESS_STEPS: JobProgressStep[] = ["diagnose", "materials", "quote", "followup", "call"];

export type JobProgressRowCopy = {
  stepLabel: string;
  statusText: string;
  hintText: string | null;
  reviewActionLabel: string;
};
export type JobProgressRowCopyMap = Record<JobProgressStep, JobProgressRowCopy>;

type AskBobHudSummary = {
  lastTaskLabel: string | null;
  lastUsedAt: string | null;
  totalRunsCount: number;
  tasksSeen: string[];
};

export type JobDetailsAskBobDerivedCopy = {
  progressRowStatuses: NextStepStatusHints;
  progressRowSecondaryCtaLabels: Partial<Record<JobProgressStep, string>>;
  askBobSummaryCollapsedLine: string;
  callHistoryHint: string | null;
  askBobHudActivityLine: string;
  askBobHudScopeHint: string | null;
  askBobHudActivityTitle?: string;
};

type JobDetailsDerivedCopyInput = {
  nextStep: NextStepResult;
  hudSummary: AskBobHudSummary;
  hasDiagnoseSnapshot: boolean;
  hasMaterialsSnapshot: boolean;
  hasQuoteSnapshot: boolean;
  hasFollowupSnapshot: boolean;
  hasCallSummary: boolean;
  callSummarySignals: CallSummarySignals | null;
};

const artifactLabels = ({
  hasDiagnoseSnapshot,
  hasMaterialsSnapshot,
  hasQuoteSnapshot,
  hasFollowupSnapshot,
  hasCallSummary,
}: Pick<JobDetailsDerivedCopyInput, "hasDiagnoseSnapshot" | "hasMaterialsSnapshot" | "hasQuoteSnapshot" | "hasFollowupSnapshot" | "hasCallSummary">): string[] => {
  const labels: string[] = [];
  if (hasDiagnoseSnapshot) {
    labels.push("Diagnosis");
  }
  if (hasMaterialsSnapshot) {
    labels.push("Materials");
  }
  if (hasQuoteSnapshot) {
    labels.push("Quote");
  }
  if (hasFollowupSnapshot) {
    labels.push("Follow-up plan");
  }
  if (hasCallSummary) {
    labels.push("Call summary");
  }
  return labels;
};

const buildCollapsedLine = (labels: string[]): string => {
  if (labels.length === 0) {
    return "AskBob hasn’t generated any artifacts for this job yet.";
  }
  if (labels.length === 1) {
    return `AskBob has generated ${labels[0]}.`;
  }
  if (labels.length === 2) {
    return `AskBob has generated ${labels[0]} and ${labels[1]}.`;
  }
  const allButLast = labels.slice(0, -1).join(", ");
  const lastLabel = labels[labels.length - 1];
  return `AskBob has generated ${allButLast}, and ${lastLabel}.`;
};

const runSummaryText = (summary: AskBobHudSummary): string | null => {
  if (summary.totalRunsCount <= 1) {
    return null;
  }
  const baseText = `${summary.totalRunsCount} AskBob runs`;
  const tasks = summary.tasksSeen;
  if (tasks.length > 0) {
    const visible = tasks.slice(0, 3);
    const remainder = tasks.length - visible.length;
    const suffix = remainder > 0 ? `, +${remainder} more` : "";
    return `${baseText} (${visible.join(", ")}${suffix})`;
  }
  return baseText;
};

const buildActivityLine = (summary: AskBobHudSummary): { text: string; title?: string } => {
  const placeholder = "No AskBob activity recorded yet for this job.";
  const lastTaskLabel = summary.lastTaskLabel?.trim() ?? "";
  const friendlyDate =
    summary.lastUsedAt && summary.lastUsedAt.trim()
      ? formatFriendlyDateTime(summary.lastUsedAt, "")
      : null;
  const hasSummary = Boolean(lastTaskLabel && friendlyDate);
  if (!hasSummary) {
    return { text: placeholder };
  }
  const runsText = runSummaryText(summary)
    ? `${runSummaryText(summary)} for this job so far`
    : "AskBob runs for this job so far";
  return {
    text: `Last AskBob activity: ${lastTaskLabel} (${friendlyDate}) · ${runsText}`,
    title: summary.lastUsedAt?.trim() ?? undefined,
  };
};

const buildCallHistoryHint = (signals: CallSummarySignals): string => {
  const attemptPlural = signals.totalAttempts === 1 ? "attempt" : "attempts";
  const parts = [
    `${signals.totalAttempts} ${attemptPlural}`,
    `${signals.answeredCount} answered`,
    `${signals.voicemailCount} voicemail`,
  ];
  const outcomeLabel = describeCallOutcome(signals.lastOutcome);
  if (outcomeLabel) {
    parts.push(`last outcome ${outcomeLabel}`);
  }
  if (signals.lastAttemptAt) {
    const friendlyLastAttempt = formatFriendlyDateTime(signals.lastAttemptAt, "");
    if (friendlyLastAttempt) {
      parts.push(`last attempt ${friendlyLastAttempt}`);
    }
  }
  const windowLabel =
    signals.bestGuessRetryWindow && signals.bestGuessRetryWindow.trim()
      ? `Best retry window: ${signals.bestGuessRetryWindow}`
      : null;
  const baseHint = parts.join(" · ");
  return [baseHint, windowLabel].filter(Boolean).join(" · ");
};

type BuildJobProgressRowCopyParams = {
  statuses: NextStepStatusHints;
  callHistoryHint: string | null;
};

export function buildJobProgressRowCopyMap(params: BuildJobProgressRowCopyParams): JobProgressRowCopyMap {
  const { statuses, callHistoryHint } = params;
  const normalizedReviewActionLabel = normalizeBobCtaLabel(jobDetailsCopy.progressRows.reviewAction);
  assertBobTone(normalizedReviewActionLabel, "derived.progressRowCopy.reviewActionLabel");

  const copyMap = {} as JobProgressRowCopyMap;
  for (const step of PROGRESS_STEPS) {
    const rawLabel = jobDetailsCopy.progressRows.labels[step] ?? jobDetailsCopy.disabled.safeFailure;
    assertBobTone(rawLabel, `derived.progressRowCopy.labels.${step}`);
    const statusSource =
      statuses[step] ??
      jobDetailsCopy.progressStatus[step]?.pending ??
      jobDetailsCopy.disabled.safeFailure;
    const normalizedStatus = normalizeBobStatus(statusSource);
    assertBobTone(normalizedStatus, `derived.progressRowCopy.${step}.statusText`);
    const hintRaw = step === "call" ? callHistoryHint?.trim() ?? "" : "";
    const normalizedHint = hintRaw ? normalizeBobStatus(hintRaw) : null;
    if (normalizedHint) {
      assertBobTone(normalizedHint, `derived.progressRowCopy.${step}.hintText`);
    }
    copyMap[step] = {
      stepLabel: rawLabel,
      statusText: normalizedStatus,
      hintText: normalizedHint,
      reviewActionLabel: normalizedReviewActionLabel,
    };
  }
  return copyMap;
}

export function deriveJobDetailsAskBobDerivedCopy(input: JobDetailsDerivedCopyInput): JobDetailsAskBobDerivedCopy {
  const {
    nextStep,
    hudSummary,
    hasDiagnoseSnapshot,
    hasMaterialsSnapshot,
    hasQuoteSnapshot,
    hasFollowupSnapshot,
    hasCallSummary,
    callSummarySignals,
  } = input;

  const statuses: NextStepStatusHints = {} as NextStepStatusHints;
  for (const step of PROGRESS_STEPS) {
    const hint = nextStep.statusHints[step];
    const normalized = normalizeBobStatus(hint);
    assertBobTone(normalized, `derived.progressRowStatuses.${step}`);
    statuses[step] = normalized;
  }

  const secondaryCtaLabels: Partial<Record<JobProgressStep, string>> = {};
  for (const step of PROGRESS_STEPS) {
    const ctaLabel = jobDetailsCopy.nextStepCta[step];
    if (!ctaLabel) {
      continue;
    }
    const normalized = normalizeBobCtaLabel(ctaLabel);
    assertBobTone(normalized, `derived.progressRowSecondaryCtaLabels.${step}`);
    secondaryCtaLabels[step] = normalized;
  }

  const summaryLabels = artifactLabels({
    hasDiagnoseSnapshot,
    hasMaterialsSnapshot,
    hasQuoteSnapshot,
    hasFollowupSnapshot,
    hasCallSummary,
  });
  const summaryLine = buildCollapsedLine(summaryLabels);
  assertBobTone(summaryLine, "derived.askBobSummaryCollapsedLine");

  const activityLineData = buildActivityLine(hudSummary);
  assertBobTone(activityLineData.text, "derived.askBobHud.activityLine");
  const scopeHint =
    activityLineData.text !== "No AskBob activity recorded yet for this job."
      ? "AskBob can help you with diagnosis, materials, quotes, and follow-ups for this job. Suggestions stay editable and should be reviewed before you save them."
      : null;
  if (scopeHint) {
    assertBobTone(scopeHint, "derived.askBobHud.scopeHint");
  }

  let historyHint: string | null = null;
  if (callSummarySignals && callSummarySignals.totalAttempts > 0) {
    const candidate = buildCallHistoryHint(callSummarySignals);
    assertBobTone(candidate, "derived.callHistory.hint");
    historyHint = candidate;
  }

  return {
    progressRowStatuses: statuses,
    progressRowSecondaryCtaLabels: secondaryCtaLabels,
    askBobSummaryCollapsedLine: summaryLine,
    callHistoryHint: historyHint,
    askBobHudActivityLine: activityLineData.text,
    askBobHudScopeHint: scopeHint,
    askBobHudActivityTitle: activityLineData.title,
  };
}
