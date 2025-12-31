import type { BobInstruction } from "@/lib/domain/bob/bobInstruction";
import { deriveJobNextInstructionFromResult } from "@/lib/domain/askbob/jobNextInstruction";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";
import type { NextStepResult } from "@/lib/domain/askbob/nextStep";

export type MobileActiveJobInstructionInput = {
  jobId: string;
  nextStep: NextStepResult;
};

export function deriveMobileActiveJobInstruction({
  jobId,
  nextStep,
}: MobileActiveJobInstructionInput): BobInstruction {
  const instruction = deriveJobNextInstructionFromResult(nextStep, {
    statement: mobileFlowCopy.activeJob.instructionStatement,
    supportingRationale: mobileFlowCopy.activeJob.nextStepHelper,
    fallbackRecommendation: mobileFlowCopy.activeJob.instructionFallback,
  });
  return {
    ...instruction,
    telemetry: {
      ...instruction.telemetry,
      isMobile: true,
      jobId,
    },
  };
}
