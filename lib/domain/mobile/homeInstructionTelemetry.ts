import type { NextStepType } from "@/lib/domain/askbob/nextStep";
import type {
  BobInstruction,
  BobInstructionPrimaryCtaActionType,
  BobInstructionStepType,
} from "@/lib/domain/bob/bobInstruction";

export type HomeInstructionTelemetryPayload = {
  isMobile: true;
  hasRecommendation: boolean;
  stepType: BobInstructionStepType;
  nextStepType?: NextStepType;
};

export type HomeInstructionPrimaryCtaPayload = {
  href: string;
  label: string;
  actionType: BobInstructionPrimaryCtaActionType;
  telemetry: HomeInstructionTelemetryPayload;
};

export function buildHomeInstructionTelemetryPayload(
  instruction: BobInstruction | null | undefined,
  hasRecommendation: boolean,
): HomeInstructionTelemetryPayload {
  const stepType = instruction?.telemetry.stepType ?? "idle";
  const payload: HomeInstructionTelemetryPayload = {
    isMobile: true,
    hasRecommendation,
    stepType,
  };
  const nextStepType = instruction?.telemetry.nextStepType;
  if (nextStepType) {
    payload.nextStepType = nextStepType;
  }
  return payload;
}

export function buildHomeInstructionPrimaryCta(
  instruction: BobInstruction,
  telemetry?: HomeInstructionTelemetryPayload,
): HomeInstructionPrimaryCtaPayload | null {
  const primaryCta = instruction.primaryCta;
  if (!primaryCta || primaryCta.disabled) {
    return null;
  }
  return {
    href: primaryCta.href ?? "#",
    label: primaryCta.label,
    actionType: primaryCta.actionType,
    telemetry: telemetry ?? buildHomeInstructionTelemetryPayload(instruction, true),
  };
}
