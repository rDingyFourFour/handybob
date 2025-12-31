import { assertBobTone } from "@/lib/domain/copy/bobVoice";
import { describe, it } from "vitest";

import { deriveMobileActiveJobInstruction } from "@/lib/domain/mobile/activeJobInstruction";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import { PROGRESS_STEP_ANCHORS } from "@/lib/domain/askbob/progressSteps";
import type { NextStepResult } from "@/lib/domain/askbob/nextStep";

function buildNextStep(overrides: Partial<NextStepResult> = {}): NextStepResult {
  return {
    stepType: "diagnose",
    rationale: "Check on improvements",
    primaryCta: {
      kind: "progress-step",
      label: jobDetailsCopy.nextStepCta.diagnose,
      actionTarget: PROGRESS_STEP_ANCHORS.diagnose,
    },
    statusHints: {},
    ...overrides,
  };
}

describe("mobile active job instruction Bob voice", () => {
  it("keeps actionable copy Bob-compliant", () => {
    const instruction = deriveMobileActiveJobInstruction({
      jobId: "job-1",
      nextStep: buildNextStep(),
    });
    assertBobTone(instruction.statement, "instruction.statement");
    assertBobTone(instruction.recommendation, "instruction.recommendation");
    if (instruction.primaryCta?.label) {
      assertBobTone(instruction.primaryCta.label, "instruction.primaryCta.label");
    }
  });

  it("keeps idle copy Bob-compliant", () => {
    const instruction = deriveMobileActiveJobInstruction({
      jobId: "job-1",
      nextStep: buildNextStep({ stepType: "done", primaryCta: null }),
    });
    assertBobTone(instruction.statement, "instruction.statement");
    assertBobTone(instruction.recommendation, "instruction.recommendation");
  });
});
