import type { AskBobFollowupSnapshotPayload } from "@/lib/domain/askbob/types";
import {
  deriveNextStepForJobDetails,
  type NextStepInput,
  type NextStepResult,
  type NextStepType,
} from "@/lib/domain/askbob/nextStep";
import { assertBobTone, normalizeBobCtaLabel } from "@/lib/domain/copy/bobVoice";
import { isCompletedJobStatus } from "@/lib/domain/jobs/jobListUi";
import { mobileHomeCopy } from "@/lib/domain/askbob/mobileFlowCopy";

export type HomeRecommendationCandidate = {
  jobId: string;
  title: string | null;
  status: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  lastActivityAt?: string | null;
  hasDiagnoseSnapshot: boolean;
  hasMaterialsSnapshot: boolean;
  latestQuoteId?: string | null;
  latestQuoteStatus?: string | null;
  followupSnapshot?: AskBobFollowupSnapshotPayload | null;
  callRecommended?: boolean;
  hasCallWithMissingOutcome?: boolean;
  latestCallOutcomeRecorded?: boolean;
  invoicePresent?: boolean;
  invoiceStatus?: string | null;
};

export type HomeRecommendation = {
  jobId: string;
  title: string | null;
  rationale: string;
  primaryCtaLabel: string;
  destination: string;
  recommendedStepType: NextStepType;
};

const STEP_PRIORITY: Record<NextStepType, number> = {
  call: 1,
  followup: 2,
  quote: 3,
  materials: 4,
  diagnose: 5,
  invoice: 6,
  done: 999,
};

const normalizeRecommendationCtaLabel = (() => {
  const label = normalizeBobCtaLabel(mobileHomeCopy.recommendationCtaLabel);
  assertBobTone(label, "homeRecommendation.primaryCtaLabel");
  return label;
})();

function buildNextStepInput(candidate: HomeRecommendationCandidate): NextStepInput {
  return {
    hasDiagnoseSnapshot: candidate.hasDiagnoseSnapshot,
    hasMaterialsSnapshot: candidate.hasMaterialsSnapshot,
    latestQuoteStatus: candidate.latestQuoteStatus ?? null,
    latestQuoteId: candidate.latestQuoteId ?? null,
    followupSnapshot: candidate.followupSnapshot ?? null,
    callRecommended: Boolean(candidate.callRecommended),
    hasCallWithMissingOutcome: Boolean(candidate.hasCallWithMissingOutcome),
    latestCallOutcomeRecorded: Boolean(candidate.latestCallOutcomeRecorded),
    invoiceStatus: candidate.invoiceStatus ?? null,
    invoicePresent: Boolean(candidate.invoicePresent),
  };
}

function resolveTimestamp(candidate: HomeRecommendationCandidate): number {
  const candidates = [candidate.lastActivityAt, candidate.updatedAt, candidate.createdAt];
  const normalized = candidates
    .map((value) => {
      if (!value) {
        return 0;
      }
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    })
    .concat(0);
  return Math.max(...normalized);
}

function assertRationaleTone(rationale: string, jobId: string): string {
  assertBobTone(rationale, `homeRecommendation.rationale.${jobId}`);
  return rationale;
}

export function deriveHomeRecommendation(
  candidates: HomeRecommendationCandidate[],
): HomeRecommendation | null {
  const actionable: Array<{
    candidate: HomeRecommendationCandidate;
    nextStep: NextStepResult;
    timestamp: number;
  }> = [];

  for (const candidate of candidates) {
    if (isCompletedJobStatus(candidate.status)) {
      continue;
    }
    const nextStep = deriveNextStepForJobDetails(buildNextStepInput(candidate));
    if (nextStep.stepType === "done") {
      continue;
    }
    actionable.push({
      candidate,
      nextStep,
      timestamp: resolveTimestamp(candidate),
    });
  }

  if (!actionable.length) {
    return null;
  }

  actionable.sort((a, b) => {
    const priorityA = STEP_PRIORITY[a.nextStep.stepType] ?? STEP_PRIORITY.done;
    const priorityB = STEP_PRIORITY[b.nextStep.stepType] ?? STEP_PRIORITY.done;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    if (a.timestamp !== b.timestamp) {
      return b.timestamp - a.timestamp;
    }
    return a.candidate.jobId.localeCompare(b.candidate.jobId);
  });

  const winner = actionable[0];
  return {
    jobId: winner.candidate.jobId,
    title: winner.candidate.title,
    rationale: assertRationaleTone(winner.nextStep.rationale, winner.candidate.jobId),
    primaryCtaLabel: normalizeRecommendationCtaLabel,
    destination: `/m/jobs/${winner.candidate.jobId}`,
    recommendedStepType: winner.nextStep.stepType,
  };
}
