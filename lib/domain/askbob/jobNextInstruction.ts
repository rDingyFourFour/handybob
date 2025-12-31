import type {
  JobProgressStep,
  NextStepInput,
  NextStepPrimaryCta,
  NextStepResult,
  NextStepType,
} from "@/lib/domain/askbob/nextStep";
import { deriveNextStepForJobDetails } from "@/lib/domain/askbob/nextStep";
import { PROGRESS_STEP_ANCHORS } from "@/lib/domain/askbob/progressSteps";
import type { BobInstruction, BobInstructionPrimaryCta, BobInstructionStepType } from "@/lib/domain/bob/bobInstruction";
import { buildBobInstruction } from "@/lib/domain/bob/bobInstruction";

type DeriveJobNextInstructionOptions = {
  statement: string;
  supportingRationale?: string | null;
  fallbackRecommendation: string;
};

const PROGRESS_ANCHOR_TO_STEP = Object.fromEntries(
  Object.entries(PROGRESS_STEP_ANCHORS).map(([step, anchor]) => [anchor, step]),
) as Record<string, JobProgressStep>;

const NEXT_STEP_TO_BOB_STEP: Record<NextStepType, BobInstructionStepType> = {
  diagnose: "diagnose",
  materials: "materials",
  quote: "quote",
  followup: "followup",
  call: "call",
  invoice: "idle",
  done: "idle",
};

const mapPrimaryCta = (
  cta: NextStepPrimaryCta | null,
  stepType: BobInstructionStepType,
): BobInstructionPrimaryCta | null => {
  if (!cta || stepType === "idle") {
    return null;
  }
  const callAnchor = PROGRESS_STEP_ANCHORS.call;
  if (cta.actionTarget === callAnchor) {
    return {
      label: cta.label,
      actionType: "call",
    };
  }
  if (cta.kind === "progress-step") {
    const targetStepId = PROGRESS_ANCHOR_TO_STEP[cta.actionTarget];
    if (!targetStepId) {
      return null;
    }
    return {
      label: cta.label,
      actionType: "progress-step",
      targetStepId,
    };
  }
  return {
    label: cta.label,
    actionType: "navigate",
    href: `#${cta.actionTarget}`,
  };
};

const buildSafeIdleInstruction = (options: DeriveJobNextInstructionOptions): BobInstruction =>
  buildBobInstruction({
    statement: options.statement,
    recommendation: options.fallbackRecommendation,
    rationale: options.supportingRationale ?? null,
    stepType: "idle",
    primaryCta: null,
  });

export function deriveJobNextInstructionFromResult(
  result: NextStepResult,
  options: DeriveJobNextInstructionOptions,
): BobInstruction {
  const bobStepType = NEXT_STEP_TO_BOB_STEP[result.stepType] ?? "idle";
  const primaryCta = mapPrimaryCta(result.primaryCta, bobStepType);
  const recommendation = result.rationale || options.fallbackRecommendation;
  return buildBobInstruction({
    statement: options.statement,
    recommendation,
    rationale: options.supportingRationale ?? null,
    stepType: bobStepType,
    primaryCta,
    nextStepType: result.stepType,
  });
}

export function deriveJobNextInstruction(
  input: NextStepInput,
  options: DeriveJobNextInstructionOptions,
): BobInstruction {
  try {
    const result = deriveNextStepForJobDetails(input);
    return deriveJobNextInstructionFromResult(result, options);
  } catch (error) {
    console.error("[deriveJobNextInstruction] failed; defaulting to idle instruction", error);
    return buildSafeIdleInstruction(options);
  }
}
