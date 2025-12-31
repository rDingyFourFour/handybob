import { assertBobTone } from "@/lib/domain/copy/bobVoice";
import { mobileHomeCopy, validateMobileHomeCopy } from "@/lib/domain/mobile/mobileHomeCopy";
const ACTIVE_JOB_CALM_REASSURANCE = "Everything looks on track for this job.";

export const mobileFlowCopy = {
  home: mobileHomeCopy,
  activeJob: {
    nextStepHeading: "Bob's next step",
    nextStepHelper: "Focus on this step to keep the job moving forward.",
    calmReassurance: ACTIVE_JOB_CALM_REASSURANCE,
    instructionFallback: ACTIVE_JOB_CALM_REASSURANCE,
    viewJobDetails: "View job details",
    notFoundTitle: "Job not found",
    notFoundBody: "We couldn’t find that job right now. Return to Home to continue.",
    notFoundAction: "Back to home",
  },
  followupPlaceholder: {
    title: "Follow-up draft",
    description: "AskBob is preparing a follow-up for this job. We'll show it here soon.",
    backButton: "Back to active job",
  },
};

export function validateMobileFlowCopy(): void {
  const check = (value: string, label: string) => assertBobTone(value, label);

  validateMobileHomeCopy();

  check(mobileFlowCopy.activeJob.nextStepHeading, "activeJob.nextStepHeading");
  check(mobileFlowCopy.activeJob.nextStepHelper, "activeJob.nextStepHelper");
  check(mobileFlowCopy.activeJob.calmReassurance, "activeJob.calmReassurance");
  check(mobileFlowCopy.activeJob.instructionFallback, "activeJob.instructionFallback");
  check(mobileFlowCopy.activeJob.viewJobDetails, "activeJob.viewJobDetails");
  check(mobileFlowCopy.activeJob.notFoundTitle, "activeJob.notFoundTitle");
  check(mobileFlowCopy.activeJob.notFoundBody, "activeJob.notFoundBody");
  check(mobileFlowCopy.activeJob.notFoundAction, "activeJob.notFoundAction");
  check(mobileFlowCopy.followupPlaceholder.title, "followupPlaceholder.title");
  check(mobileFlowCopy.followupPlaceholder.description, "followupPlaceholder.description");
  check(mobileFlowCopy.followupPlaceholder.backButton, "followupPlaceholder.backButton");
}
