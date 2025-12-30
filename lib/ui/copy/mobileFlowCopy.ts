import { assertBobTone } from "@/lib/domain/copy/bobVoice";

export const mobileFlowCopy = {
  home: {
    title: "Home",
    greetingTemplate: "Good morning, {name}",
    greetingFallback: "Good morning",
    statement: "I'm tracking the job that needs a small nudge.",
    recommendationLabel: "Next step",
    recommendationTitleFallback: "Untitled job",
    idleReassurance: "Everything's up to date. I'll let you know if anything changes.",
    recommendationCtaLabel: "Review job",
  },
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

  check(mobileFlowCopy.home.title, "home.title");
  check(mobileFlowCopy.home.greetingTemplate, "home.greetingTemplate");
  check(mobileFlowCopy.home.greetingFallback, "home.greetingFallback");
  check(mobileFlowCopy.home.statement, "home.statement");
  check(mobileFlowCopy.home.recommendationLabel, "home.recommendationLabel");
  check(
    mobileFlowCopy.home.recommendationTitleFallback,
    "home.recommendationTitleFallback",
  );
  check(mobileFlowCopy.home.idleReassurance, "home.idleReassurance");
  check(mobileFlowCopy.home.recommendationCtaLabel, "home.recommendationCtaLabel");

  check(mobileFlowCopy.activeJob.nextStepHeading, "activeJob.nextStepHeading");
  check(mobileFlowCopy.activeJob.nextStepHelper, "activeJob.nextStepHelper");
  check(mobileFlowCopy.activeJob.calmReassurance, "activeJob.calmReassurance");
  check(mobileFlowCopy.activeJob.viewJobDetails, "activeJob.viewJobDetails");
  check(mobileFlowCopy.followupPlaceholder.title, "followupPlaceholder.title");
  check(mobileFlowCopy.followupPlaceholder.description, "followupPlaceholder.description");
  check(mobileFlowCopy.followupPlaceholder.backButton, "followupPlaceholder.backButton");
}
