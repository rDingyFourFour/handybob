import { assertBobTone } from "@/lib/domain/copy/bobVoice";

export const jobDetailsCopy = {
  jobBrief: {
    heading: "Job brief",
    stateLabel: "Job state",
    backToJobs: "Back to jobs",
    customerLabel: "Customer",
  },
  nextStep: {
    title: "Next step",
    doneLabel: "All caught up",
    confirmation: "Tap the button when you’re ready to move forward.",
    fallbackRationale: "Everything looks on track for this job.",
  },
  nextStepCta: {
    diagnose: "Review diagnosis",
    materials: "Review materials list",
    quote: "Review quote",
    followup: "Review follow-up plan",
    call: "Start call session",
    invoice: "Create invoice",
  },
  progressStatus: {
    diagnose: {
      pending: "Waiting on diagnosis",
      done: "Diagnosis complete",
    },
    materials: {
      pending: "Waiting on materials",
      ready: "Materials ready",
    },
    quote: {
      pending: "Waiting on quote",
      drafted: "Quote drafted",
      sent: "Quote sent",
      accepted: "Quote accepted",
    },
    followup: {
      pending: "Follow-up pending",
      ready: "Follow-up ready",
    },
    call: {
      pending: "Call pending",
      ready: "Call ready",
    },
  },
  progressRows: {
    labels: {
      diagnose: "Diagnose",
      materials: "Materials",
      quote: "Quote",
      followup: "Follow-up",
      call: "Call",
    },
    reviewAction: "Review",
  },
  askBobSummary: {
    collapsedHint: "AskBob summary",
    expandedHint: "AskBob details",
    toggle: {
      expand: "View details",
      collapse: "Hide details",
    },
  },
  secondary: {
    moreLabel: "More job info",
  },
  schedule: {
    heading: "Schedule & logistics",
  },
  history: {
    heading: "Job history",
  },
  disabled: {
    safeFailure: "Something went wrong. Try again in a moment.",
  },
};

export function validateJobDetailsCopy(): void {
  const check = (value: string, label: string) => assertBobTone(value, label);

  check(jobDetailsCopy.jobBrief.heading, "jobBrief.heading");
  check(jobDetailsCopy.jobBrief.stateLabel, "jobBrief.stateLabel");
  check(jobDetailsCopy.jobBrief.backToJobs, "jobBrief.backToJobs");
  check(jobDetailsCopy.jobBrief.customerLabel, "jobBrief.customerLabel");

  check(jobDetailsCopy.nextStep.title, "nextStep.title");
  check(jobDetailsCopy.nextStep.doneLabel, "nextStep.doneLabel");
  check(jobDetailsCopy.nextStep.fallbackRationale, "nextStep.fallbackRationale");
  check(jobDetailsCopy.nextStep.confirmation, "nextStep.confirmation");

  Object.entries(jobDetailsCopy.nextStepCta).forEach(([ctaKey, ctaLabel]) => {
    check(ctaLabel, `nextStepCta.${ctaKey}`);
  });

  Object.entries(jobDetailsCopy.progressStatus).forEach(([stepKey, stepEntries]) => {
    Object.entries(stepEntries).forEach(([statusKey, label]) => {
      check(label, `progressStatus.${stepKey}.${statusKey}`);
    });
  });
  Object.entries(jobDetailsCopy.progressRows.labels).forEach(([stepKey, label]) => {
    check(label, `progressRows.labels.${stepKey}`);
  });
  check(jobDetailsCopy.progressRows.reviewAction, "progressRows.reviewAction");

  check(jobDetailsCopy.askBobSummary.collapsedHint, "askBobSummary.collapsedHint");
  check(jobDetailsCopy.askBobSummary.expandedHint, "askBobSummary.expandedHint");
  check(jobDetailsCopy.askBobSummary.toggle.expand, "askBobSummary.toggle.expand");
  check(jobDetailsCopy.askBobSummary.toggle.collapse, "askBobSummary.toggle.collapse");
  check(jobDetailsCopy.secondary.moreLabel, "secondary.moreLabel");
  check(jobDetailsCopy.schedule.heading, "schedule.heading");
  check(jobDetailsCopy.history.heading, "history.heading");
  check(jobDetailsCopy.disabled.safeFailure, "disabled.safeFailure");
}
