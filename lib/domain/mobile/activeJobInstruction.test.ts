import { describe, expect, it } from "vitest";

import { deriveMobileActiveJobInstruction } from "@/lib/domain/mobile/activeJobInstruction";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import { PROGRESS_STEP_ANCHORS } from "@/lib/domain/askbob/progressSteps";
import type { NextStepResult } from "@/lib/domain/askbob/nextStep";
import { normalizeBobCtaLabel } from "@/lib/domain/copy/bobVoice";

function buildNextStep(overrides: Partial<NextStepResult> = {}): NextStepResult {
  return {
    stepType: "diagnose",
    rationale: "Check on diagnosis",
    primaryCta: {
      kind: "progress-step",
      label: jobDetailsCopy.nextStepCta.diagnose,
      actionTarget: PROGRESS_STEP_ANCHORS.diagnose,
    },
    statusHints: {},
    ...overrides,
  };
}

describe("deriveMobileActiveJobInstruction", () => {
  it("includes normalized CTA copy and job metadata", () => {
    const nextStep = buildNextStep();
    const instruction = deriveMobileActiveJobInstruction({
      jobId: "job-1",
      nextStep,
    });
    expect(instruction.primaryCta?.label).toBe(
      normalizeBobCtaLabel(jobDetailsCopy.nextStepCta.diagnose),
    );
    expect(instruction.telemetry.jobId).toBe("job-1");
    expect(instruction.telemetry.isMobile).toBe(true);
  });

  it("falls back to idle when the next step is done", () => {
    const nextStep = buildNextStep({
      stepType: "done",
      primaryCta: null,
    });
    const instruction = deriveMobileActiveJobInstruction({
      jobId: "job-1",
      nextStep,
    });
    expect(instruction.primaryCta).toBeNull();
    expect(instruction.telemetry.isIdle).toBe(true);
  });
});
