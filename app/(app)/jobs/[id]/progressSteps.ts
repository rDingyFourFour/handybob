import type { JobProgressStep } from "@/lib/domain/askbob/nextStep";

export type ProgressStepInfo = {
  key: JobProgressStep;
  label: string;
  anchor: string;
};

export const PROGRESS_STEPS: ProgressStepInfo[] = [
  { key: "diagnose", label: "Diagnose", anchor: "progress-diagnose" },
  { key: "materials", label: "Materials", anchor: "progress-materials" },
  { key: "quote", label: "Quote", anchor: "progress-quote" },
  { key: "followup", label: "Follow-up", anchor: "progress-followup" },
  { key: "call", label: "Call", anchor: "progress-call" },
];
