import { describe, expect, it } from "vitest";

import { normalizeBobCtaLabel } from "@/lib/domain/copy/bobVoice";
import { deriveJobNextInstruction } from "@/lib/domain/askbob/jobNextInstruction";
import type { NextStepInput } from "@/lib/domain/askbob/nextStep";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import { getBobInstructionSentence } from "@/lib/domain/askbob/bobInstructionSentenceCopy";

const instructionOptions = {
  supportingRationale: jobDetailsCopy.nextStep.confirmation,
  fallbackRecommendation: jobDetailsCopy.nextStep.fallbackRationale,
};

function buildInput(overrides: Partial<NextStepInput> = {}): NextStepInput {
  return {
    hasDiagnoseSnapshot: true,
    hasMaterialsSnapshot: true,
    latestQuoteId: "quote-1",
    latestQuoteStatus: "accepted",
    followupSnapshot: null,
    callRecommended: false,
    hasCallWithMissingOutcome: false,
    latestCallOutcomeRecorded: false,
    invoicePresent: false,
    invoiceStatus: null,
    ...overrides,
  };
}

describe("deriveJobNextInstruction", () => {
  it("recommends diagnose when a diagnosis is missing", () => {
    const instruction = deriveJobNextInstruction(
      buildInput({ hasDiagnoseSnapshot: false }),
      instructionOptions,
    );
    expect(instruction.stepType).toBe("diagnose");
    expect(instruction.primaryCta).not.toBeNull();
    expect(instruction.primaryCta?.actionType).toBe("progress-step");
    expect(instruction.primaryCta?.targetStepId).toBe("diagnose");
    expect(instruction.primaryCta?.label).toBe(
      normalizeBobCtaLabel(jobDetailsCopy.nextStepCta.diagnose),
    );
    expect(instruction.telemetry.stepType).toBe("diagnose");
    expect(instruction.telemetry.hasPrimaryCta).toBe(true);
    expect(instruction.telemetry.isIdle).toBe(false);
    expect(instruction.statement).toBe(getBobInstructionSentence("in_progress"));
    expect(instruction.recommendation).toBeTruthy();
  });

  it("recommends materials when needed", () => {
    const instruction = deriveJobNextInstruction(
      buildInput({ hasMaterialsSnapshot: false }),
      instructionOptions,
    );
    expect(instruction.stepType).toBe("materials");
    expect(instruction.primaryCta?.targetStepId).toBe("materials");
    expect(instruction.telemetry.stepType).toBe("materials");
    expect(instruction.primaryCta?.label).toBe(
      normalizeBobCtaLabel(jobDetailsCopy.nextStepCta.materials),
    );
  });

  it("recommends moving to quote when the quote is not ready", () => {
    const instruction = deriveJobNextInstruction(
      buildInput({ latestQuoteId: null, latestQuoteStatus: null }),
      instructionOptions,
    );
    expect(instruction.stepType).toBe("quote");
    expect(instruction.primaryCta?.targetStepId).toBe("quote");
    expect(instruction.primaryCta?.label).toBe(
      normalizeBobCtaLabel(jobDetailsCopy.nextStepCta.quote),
    );
  });

  it("recommends follow-up when snapshots indicate action", () => {
    const instruction = deriveJobNextInstruction(
      buildInput({
        latestQuoteStatus: "accepted",
        followupSnapshot: {
          recommendedAction: "Check in",
          rationale: "Keep the ball rolling",
          steps: [],
          shouldSendMessage: true,
          shouldScheduleVisit: false,
          shouldCall: false,
          shouldWait: false,
          modelLatencyMs: 0,
        },
      }),
      instructionOptions,
    );
    expect(instruction.stepType).toBe("followup");
    expect(instruction.primaryCta?.targetStepId).toBe("followup");
    expect(instruction.primaryCta?.label).toBe(
      normalizeBobCtaLabel(jobDetailsCopy.nextStepCta.followup),
    );
  });

  it("recommends a call when one is suggested", () => {
    const instruction = deriveJobNextInstruction(
      buildInput({ callRecommended: true }),
      instructionOptions,
    );
    expect(instruction.stepType).toBe("call");
    expect(instruction.primaryCta?.actionType).toBe("call");
    expect(instruction.primaryCta?.label).toBe(
      normalizeBobCtaLabel(jobDetailsCopy.nextStepCta.call),
    );
  });

  it("falls back to idle when everything is complete", () => {
    const instruction = deriveJobNextInstruction(
      buildInput({
        latestQuoteId: "quote-1",
        latestQuoteStatus: "accepted",
        invoicePresent: true,
        invoiceStatus: "paid",
      }),
      instructionOptions,
    );
    expect(instruction.stepType).toBe("idle");
    expect(instruction.telemetry.isIdle).toBe(true);
    expect(instruction.primaryCta).toBeNull();
    expect(instruction.telemetry.nextStepType).toBe("done");
  });
});
