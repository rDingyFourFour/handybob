import { describe, expect, it } from "vitest";

import type { NextStepResult, NextStepStatusHints, NextStepType } from "@/lib/domain/askbob/nextStep";
import { resolveBobInstructionState } from "@/lib/domain/askbob/jobNextInstruction";

const DEFAULT_STATUS_HINTS: NextStepStatusHints = {
  diagnose: "diagnose",
  materials: "materials",
  quote: "quote",
  followup: "followup",
  call: "call",
};

function buildNextStepResult(
  stepType: NextStepType,
  overrides: Partial<NextStepResult> = {},
): NextStepResult {
  return {
    stepType,
    rationale: "irrelevant",
    primaryCta: null,
    statusHints: DEFAULT_STATUS_HINTS,
    followUpDraftReady: false,
    ...overrides,
  };
}

describe("resolveBobInstructionState", () => {
  it("returns completed when the job is finished", () => {
    const nextStep = buildNextStepResult("diagnose");
    expect(resolveBobInstructionState(nextStep, true)).toBe("completed");
  });

  it("maps done to idle", () => {
    const nextStep = buildNextStepResult("done");
    expect(resolveBobInstructionState(nextStep, false)).toBe("idle");
  });

  it("maps call to call_recommended", () => {
    const nextStep = buildNextStepResult("call");
    expect(resolveBobInstructionState(nextStep, false)).toBe("call_recommended");
  });

  it("maps followup without a draft to followup_due", () => {
    const nextStep = buildNextStepResult("followup", { followUpDraftReady: false });
    expect(resolveBobInstructionState(nextStep, false)).toBe("followup_due");
  });

  it("maps followup with a draft to followup_draft_ready", () => {
    const nextStep = buildNextStepResult("followup", { followUpDraftReady: true });
    expect(resolveBobInstructionState(nextStep, false)).toBe("followup_draft_ready");
  });

  it("maps invoice to in_progress", () => {
    const nextStep = buildNextStepResult("invoice");
    expect(resolveBobInstructionState(nextStep, false)).toBe("in_progress");
  });

  it("maps quote to in_progress", () => {
    const nextStep = buildNextStepResult("quote");
    expect(resolveBobInstructionState(nextStep, false)).toBe("in_progress");
  });

  it("maps unknown step types to in_progress", () => {
    const nextStep = buildNextStepResult("unknown" as NextStepType);
    expect(resolveBobInstructionState(nextStep, false)).toBe("in_progress");
  });
});
