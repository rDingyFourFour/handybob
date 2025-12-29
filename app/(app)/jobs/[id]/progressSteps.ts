import type { JobProgressStep } from "@/lib/domain/askbob/nextStep";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";

export type ProgressStepInfo = {
  key: JobProgressStep;
  label: string;
  anchor: string;
};

const progressLabels = jobDetailsCopy.progressRows.labels;

export const PROGRESS_STEPS: ProgressStepInfo[] = [
  { key: "diagnose", label: progressLabels.diagnose, anchor: "progress-diagnose" },
  { key: "materials", label: progressLabels.materials, anchor: "progress-materials" },
  { key: "quote", label: progressLabels.quote, anchor: "progress-quote" },
  { key: "followup", label: progressLabels.followup, anchor: "progress-followup" },
  { key: "call", label: progressLabels.call, anchor: "progress-call" },
];
