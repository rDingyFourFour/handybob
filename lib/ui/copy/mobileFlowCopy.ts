import { assertBobTone } from "@/lib/domain/copy/bobVoice";
import { mobileHomeCopy, validateMobileHomeCopy } from "@/lib/domain/mobile/mobileHomeCopy";

export const mobileFlowCopy = {
  home: mobileHomeCopy,
  activeJob: {
    nextStepHeading: "Bob's next step",
    nextStepHelper: "Focus on this step to keep the job moving forward.",
    calmReassurance: "Everything looks on track for this job.",
    viewJobDetails: "View job details",
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
  check(mobileFlowCopy.activeJob.viewJobDetails, "activeJob.viewJobDetails");
  check(mobileFlowCopy.followupPlaceholder.title, "followupPlaceholder.title");
  check(mobileFlowCopy.followupPlaceholder.description, "followupPlaceholder.description");
  check(mobileFlowCopy.followupPlaceholder.backButton, "followupPlaceholder.backButton");
}
