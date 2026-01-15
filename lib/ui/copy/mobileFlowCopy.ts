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
    retryDescription:
      "AskBob had trouble preparing the draft. Tap Back and try again, or reload.",
    backButton: "Back to active job",
    retryButton: "Retry draft",
  },
  followupDraft: {
    title: "Follow-up draft",
    description:
      "AskBob drafted a follow-up message for this job. Review the suggested text below before sending it.",
    messageHeading: "Suggested message",
    stepsHeading: "Next steps",
    stepsFallback: "AskBob recommends covering the customer's next steps in your message.",
    backButton: "Back to active job",
    backHomeButton: "Back to Home",
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
  check(mobileFlowCopy.followupPlaceholder.retryDescription, "followupPlaceholder.retryDescription");
  check(mobileFlowCopy.followupPlaceholder.backButton, "followupPlaceholder.backButton");
  check(mobileFlowCopy.followupPlaceholder.retryButton, "followupPlaceholder.retryButton");
  check(mobileFlowCopy.followupDraft.title, "followupDraft.title");
  check(mobileFlowCopy.followupDraft.description, "followupDraft.description");
  check(mobileFlowCopy.followupDraft.messageHeading, "followupDraft.messageHeading");
  check(mobileFlowCopy.followupDraft.stepsHeading, "followupDraft.stepsHeading");
  check(mobileFlowCopy.followupDraft.stepsFallback, "followupDraft.stepsFallback");
  check(mobileFlowCopy.followupDraft.backButton, "followupDraft.backButton");
  check(mobileFlowCopy.followupDraft.backHomeButton, "followupDraft.backHomeButton");
}
