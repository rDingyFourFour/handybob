import type { JobProgressStep } from "@/lib/domain/askbob/nextStep";

export const PROGRESS_STEP_ORDER: JobProgressStep[] = [
  "diagnose",
  "materials",
  "quote",
  "followup",
  "call",
];

export const PROGRESS_STEP_ANCHORS: Record<JobProgressStep, string> = {
  diagnose: "progress-diagnose",
  materials: "progress-materials",
  quote: "progress-quote",
  followup: "progress-followup",
  call: "progress-call",
};
