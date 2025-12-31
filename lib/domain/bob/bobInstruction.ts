import { assertBobTone, normalizeBobCtaLabel, normalizeBobStatus } from "@/lib/domain/copy/bobVoice";
import type { NextStepType } from "@/lib/domain/askbob/nextStep";

export type BobInstructionStepType = "diagnose" | "materials" | "quote" | "followup" | "call" | "idle";

export type BobInstructionPrimaryCtaActionType = "progress-step" | "navigate" | "call";

export type BobInstructionPrimaryCta = {
  label: string;
  actionType: BobInstructionPrimaryCtaActionType;
  href?: string;
  targetStepId?: string;
  disabled?: boolean;
  disabledReason?: string;
};

export type BobInstructionTelemetry = {
  stepType: BobInstructionStepType;
  hasPrimaryCta: boolean;
  isIdle: boolean;
  nextStepType?: NextStepType;
  callId?: string;
  workspaceId?: string;
  jobId?: string;
  customerId?: string;
  mode?: string;
  reasonCode?: string;
  primaryCtaLabel?: string;
  isMobile?: boolean;
};

export type BobInstruction = {
  statement: string;
  recommendation: string;
  rationale?: string | null;
  stepType: BobInstructionStepType;
  primaryCta: BobInstructionPrimaryCta | null;
  telemetry: BobInstructionTelemetry;
};

export type BuildBobInstructionParams = {
  statement: string;
  recommendation: string;
  rationale?: string | null;
  stepType: BobInstructionStepType;
  primaryCta?: BobInstructionPrimaryCta | null;
  nextStepType?: NextStepType | null;
};

const sanitizeStatement = (value: string, label: string): string => {
  const normalized = normalizeBobStatus(value);
  assertBobTone(normalized, label);
  return normalized;
};

const sanitizePrimaryCta = (
  cta: BobInstructionPrimaryCta | null | undefined,
  labelContext: string,
): BobInstructionPrimaryCta | null => {
  if (!cta) {
    return null;
  }
  const normalizedLabel = normalizeBobCtaLabel(cta.label);
  assertBobTone(normalizedLabel, labelContext);
  return {
    ...cta,
    label: normalizedLabel,
  };
};

export function buildBobInstruction(params: BuildBobInstructionParams): BobInstruction {
  const statement = sanitizeStatement(params.statement, "bobInstruction.statement");
  const recommendation = sanitizeStatement(params.recommendation, "bobInstruction.recommendation");
  const rationale = params.rationale ? sanitizeStatement(params.rationale, "bobInstruction.rationale") : null;
  const primaryCta = sanitizePrimaryCta(params.primaryCta ?? null, "bobInstruction.primaryCta");
  const hasPrimaryCta = Boolean(primaryCta && !primaryCta.disabled);
  const isIdle = params.stepType === "idle";
  const telemetry: BobInstructionTelemetry = {
    stepType: params.stepType,
    hasPrimaryCta,
    isIdle,
  };
  if (params.nextStepType && params.nextStepType !== params.stepType) {
    telemetry.nextStepType = params.nextStepType;
  }
  return {
    statement,
    recommendation,
    rationale,
    stepType: params.stepType,
    primaryCta,
    telemetry,
  };
}
