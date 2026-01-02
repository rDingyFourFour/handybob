import type { AskBobFollowupSnapshotPayload } from "@/lib/domain/askbob/types";
import { deriveNextStepForJobDetails } from "@/lib/domain/askbob/nextStep";
import {
  deriveJobNextInstructionFromResult,
  resolveBobInstructionState,
} from "@/lib/domain/askbob/jobNextInstruction";
import {
  assertBobTone,
  normalizeBobCtaLabel,
  normalizeBobStatus,
} from "@/lib/domain/copy/bobVoice";
import { isCompletedJobStatus } from "@/lib/domain/jobs/jobListUi";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";
import type { BobInstruction, BobInstructionPrimaryCta } from "@/lib/domain/bob/bobInstruction";
import {
  getHomeInstructionFirstCopy,
  HomeInstructionFirstCopyPayload,
  validateHomeInstructionFirstCopy,
} from "@/lib/domain/mobile/homeInstructionCopy";

export type HomeInstructionCandidate = {
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
  followUpDraftReady?: boolean;
};

export type HomeInstruction = {
  jobId: string;
  title: string | null;
  instruction: BobInstruction;
  instructionCopy?: HomeInstructionFirstCopyPayload;
};

const STEP_PRIORITY: Record<string, number> = {
  call: 1,
  followup: 2,
  quote: 3,
  materials: 4,
  diagnose: 5,
  invoice: 6,
  done: 999,
};

const normalizeRecommendationCtaLabel = (() => {
  const normalized = normalizeBobCtaLabel(mobileFlowCopy.home.recommendationCtaLabel);
  assertBobTone(normalized, "homeInstruction.primaryCtaLabel");
  return normalized;
})();

validateHomeInstructionFirstCopy();

function buildNextStepInput(candidate: HomeInstructionCandidate) {
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
    followUpDraftReady: Boolean(candidate.followUpDraftReady),
  };
}

function resolveTimestamp(candidate: HomeInstructionCandidate): number {
  const timestamps = [candidate.lastActivityAt, candidate.updatedAt, candidate.createdAt];
  const normalized = timestamps
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

const overrideWithHomeCta = (
  instruction: BobInstruction,
  jobId: string,
): BobInstruction => {
  if (!instruction.primaryCta) {
    return instruction;
  }
  const primaryCta: BobInstructionPrimaryCta = {
    label: normalizeRecommendationCtaLabel,
    actionType: "navigate",
    href: `/m/jobs/${jobId}`,
    disabled: instruction.primaryCta.disabled,
    disabledReason: instruction.primaryCta.disabledReason,
  };
  const hasPrimaryCta = Boolean(primaryCta && !primaryCta.disabled);
  return {
    ...instruction,
    primaryCta,
    telemetry: {
      ...instruction.telemetry,
      hasPrimaryCta,
    },
  };
};

export function deriveHomeInstruction(candidates: HomeInstructionCandidate[]): HomeInstruction | null {
  const actionable: Array<{
    candidate: HomeInstructionCandidate;
    instruction: BobInstruction;
    nextStepType: string;
    timestamp: number;
    instructionCopy?: HomeInstructionFirstCopyPayload;
  }> = [];

  for (const candidate of candidates) {
    const isJobCompleted = isCompletedJobStatus(candidate.status);
    if (isJobCompleted) {
      continue;
    }
    const nextStep = deriveNextStepForJobDetails(buildNextStepInput(candidate));
    if (nextStep.stepType === "done") {
      continue;
    }
    const state = resolveBobInstructionState(nextStep, isJobCompleted);
    const instructionCopy = getHomeInstructionFirstCopy(state);
    const instruction = overrideWithHomeCta(
      deriveJobNextInstructionFromResult(nextStep, {
        supportingRationale: null,
        fallbackRecommendation: jobDetailsCopy.nextStep.fallbackRationale,
      }),
      candidate.jobId,
    );
    const decoratedInstruction = instructionCopy
      ? {
          ...instruction,
          statement: normalizeBobStatus(instructionCopy.instructionSubcopy),
        }
      : instruction;
    if (!decoratedInstruction.primaryCta) {
      continue;
    }
    actionable.push({
      candidate,
      instruction: decoratedInstruction,
      nextStepType: nextStep.stepType,
      timestamp: resolveTimestamp(candidate),
      instructionCopy,
    });
  }

  if (!actionable.length) {
    return null;
  }

  actionable.sort((a, b) => {
    const priorityA = STEP_PRIORITY[a.nextStepType] ?? STEP_PRIORITY.done;
    const priorityB = STEP_PRIORITY[b.nextStepType] ?? STEP_PRIORITY.done;
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
    instruction: winner.instruction,
    instructionCopy: winner.instructionCopy,
  };
}
