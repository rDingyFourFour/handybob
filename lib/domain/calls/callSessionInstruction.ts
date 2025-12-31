import type { BobInstructionPrimaryCtaActionType } from "@/lib/domain/bob/bobInstruction";
import { buildBobInstruction } from "@/lib/domain/bob/bobInstruction";
import type { CallSessionPrimaryCtaReasonCode } from "@/lib/domain/calls/sessions";
import { callSessionInstructionCopy } from "@/lib/ui/copy/callSessionInstructionCopy";
import type { PrimaryCta, PrimaryCtaKind } from "@/app/(app)/calls/[id]/callSessionTypes";

export type CallSessionInstructionMode = "automated" | "manual" | "unselected";

export type CallSessionInstructionInput = {
  workspaceId: string;
  callId: string;
  jobId: string | null;
  customerId: string | null;
  mode: CallSessionInstructionMode;
  primaryCta: PrimaryCta;
  ctaReasonCode: CallSessionPrimaryCtaReasonCode;
};

const PRIMARY_CTA_LABEL_BY_KIND: Record<PrimaryCtaKind, keyof typeof callSessionInstructionCopy.primaryCta.label> = {
  "start-automated-call": "startAutomated",
  "start-guided-call": "startGuided",
  "refresh-status": "refreshStatus",
  "capture-outcome": "captureOutcome",
  "generate-followup": "generateFollowup",
  "open-composer": "openComposer",
  disabled: "disabled",
};

const PRIMARY_CTA_ACTION_TYPE_BY_KIND: Record<PrimaryCtaKind, BobInstructionPrimaryCtaActionType> = {
  "start-automated-call": "call",
  "start-guided-call": "call",
  "refresh-status": "navigate",
  "capture-outcome": "navigate",
  "generate-followup": "navigate",
  "open-composer": "navigate",
  disabled: "navigate",
};

const resolvePrimaryCtaLabel = (kind: PrimaryCtaKind): string =>
  callSessionInstructionCopy.primaryCta.label[PRIMARY_CTA_LABEL_BY_KIND[kind]];

const resolveRecommendation = (reasonCode: CallSessionPrimaryCtaReasonCode): string =>
  callSessionInstructionCopy.primaryCta.explanation[reasonCode] ??
  callSessionInstructionCopy.primaryCta.explanation.fallback;

export function deriveCallSessionInstruction(
  input: CallSessionInstructionInput,
): ReturnType<typeof buildBobInstruction> {
  const primaryCtaLabel = resolvePrimaryCtaLabel(input.primaryCta.kind);
  const primaryCta = {
    label: primaryCtaLabel,
    actionType: PRIMARY_CTA_ACTION_TYPE_BY_KIND[input.primaryCta.kind],
    disabled: input.primaryCta.disabled,
  };
  const instruction = buildBobInstruction({
    statement: callSessionInstructionCopy.statement,
    recommendation: resolveRecommendation(input.ctaReasonCode),
    stepType: "followup",
    primaryCta,
    nextStepType: "followup",
  });
  return {
    ...instruction,
    telemetry: {
      ...instruction.telemetry,
      callId: input.callId,
      workspaceId: input.workspaceId,
      jobId: input.jobId ?? undefined,
      customerId: input.customerId ?? undefined,
      mode: input.mode,
      reasonCode: input.ctaReasonCode,
      primaryCtaLabel: instruction.primaryCta?.label ?? undefined,
    },
  };
}
