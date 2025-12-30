import type { JobProgressStep } from "@/lib/domain/askbob/nextStep";

export type JobDetailsSectionId =
  | "jobBrief"
  | "nextStep"
  | "askBobSummary"
  | "progressHeader"
  | "progressAccordionDefaultOpen"
  | "execution"
  | "schedule"
  | "history";

export type JobDetailsMobilePrimarySurfacePolicy = {
  visibleSections: JobDetailsSectionId[];
  askBobSummaryCollapsedByDefault: boolean;
  progressAccordionDefaultOpenStepId: JobProgressStep | null;
  hideExecutionByDefault: boolean;
  hideScheduleByDefault: boolean;
  hideHistoryByDefault: boolean;
};

type GetPolicyInput = {
  isMobile: boolean;
  defaultProgressStep: JobProgressStep | null;
};

const MOBILE_VISIBLE_SECTIONS: JobDetailsSectionId[] = [
  "jobBrief",
  "nextStep",
  "askBobSummary",
  "progressHeader",
  "progressAccordionDefaultOpen",
];

const DESKTOP_VISIBLE_SECTIONS: JobDetailsSectionId[] = [
  ...MOBILE_VISIBLE_SECTIONS,
  "execution",
  "schedule",
  "history",
];

export function getJobDetailsMobilePrimarySurfacePolicy({
  isMobile,
  defaultProgressStep,
}: GetPolicyInput): JobDetailsMobilePrimarySurfacePolicy {
  if (isMobile) {
    return {
      visibleSections: [...MOBILE_VISIBLE_SECTIONS],
      askBobSummaryCollapsedByDefault: true,
      progressAccordionDefaultOpenStepId: null,
      hideExecutionByDefault: true,
      hideScheduleByDefault: true,
      hideHistoryByDefault: true,
    };
  }
  return {
    visibleSections: [...DESKTOP_VISIBLE_SECTIONS],
    askBobSummaryCollapsedByDefault: true,
    progressAccordionDefaultOpenStepId: defaultProgressStep,
    hideExecutionByDefault: false,
    hideScheduleByDefault: false,
    hideHistoryByDefault: false,
  };
}
