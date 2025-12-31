import type { BobInstruction } from "@/lib/domain/bob/bobInstruction";
import { deriveJobNextInstructionFromResult } from "@/lib/domain/askbob/jobNextInstruction";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";
import type { NextStepResult } from "@/lib/domain/askbob/nextStep";
import { isCompletedJobStatus } from "@/lib/domain/jobs/jobListUi";

export type MobileActiveJobInstructionInput = {
  jobId: string;
  nextStep: NextStepResult;
  jobStatus?: string | null;
};

export function deriveMobileActiveJobInstruction({
  jobId,
  nextStep,
  jobStatus,
}: MobileActiveJobInstructionInput): BobInstruction {
  const instruction = deriveJobNextInstructionFromResult(nextStep, {
    supportingRationale: mobileFlowCopy.activeJob.nextStepHelper,
    fallbackRecommendation: mobileFlowCopy.activeJob.instructionFallback,
    isJobCompleted: isCompletedJobStatus(jobStatus ?? null),
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
