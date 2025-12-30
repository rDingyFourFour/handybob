import type { JobProgressStep } from "@/lib/domain/askbob/nextStep";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import { PROGRESS_STEP_ANCHORS, PROGRESS_STEP_ORDER } from "@/lib/domain/askbob/progressSteps";

export type ProgressStepInfo = {
  key: JobProgressStep;
  label: string;
  anchor: string;
};

const progressLabels = jobDetailsCopy.progressRows.labels;

export const PROGRESS_STEPS: ProgressStepInfo[] = PROGRESS_STEP_ORDER.map((step) => ({
  key: step,
  label: progressLabels[step],
  anchor: PROGRESS_STEP_ANCHORS[step],
}));
