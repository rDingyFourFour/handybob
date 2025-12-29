import { describe, expect, it } from "vitest";

import { deriveNextStepForJobDetails, type NextStepInput } from "@/lib/domain/askbob/nextStep";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";

function buildInput(overrides: Partial<NextStepInput> = {}): NextStepInput {
  return {
    hasDiagnoseSnapshot: false,
    hasMaterialsSnapshot: false,
    latestQuoteId: undefined,
    latestQuoteStatus: null,
    followupSnapshot: null,
    callRecommended: false,
    hasCallWithMissingOutcome: false,
    latestCallOutcomeRecorded: false,
    invoiceStatus: null,
    invoicePresent: false,
    ...overrides,
  };
}

describe("deriveNextStepForJobDetails", () => {
  it("chooses diagnosis when no snapshot exists", () => {
    const result = deriveNextStepForJobDetails(buildInput());
    expect(result.stepType).toBe("diagnose");
    expect(result.primaryCta?.actionTarget).toBe("progress-diagnose");
    expect(result.statusHints.diagnose).toBe(jobDetailsCopy.progressStatus.diagnose.pending);
    expect(result.rationale).toMatch(/diagnosis/i);
  });

  it("moves to materials when diagnosis is ready but materials missing", () => {
    const result = deriveNextStepForJobDetails(
      buildInput({
        hasDiagnoseSnapshot: true,
      }),
    );
    expect(result.stepType).toBe("materials");
    expect(result.primaryCta?.actionTarget).toBe("progress-materials");
    expect(result.rationale).toMatch(/material/i);
  });

  it("prompts for a quote when diagnosis and materials are complete but no quote exists", () => {
    const result = deriveNextStepForJobDetails(
      buildInput({
        hasDiagnoseSnapshot: true,
        hasMaterialsSnapshot: true,
      }),
    );
    expect(result.stepType).toBe("quote");
    expect(result.primaryCta?.actionTarget).toBe("progress-quote");
    expect(result.rationale).toMatch(/quote/i);
  });

  it("keeps the quote step if a draft quote exists but has not been accepted", () => {
    const result = deriveNextStepForJobDetails(
      buildInput({
        hasDiagnoseSnapshot: true,
        hasMaterialsSnapshot: true,
        latestQuoteId: "quote-1",
        latestQuoteStatus: "draft",
      }),
    );
    expect(result.stepType).toBe("quote");
    expect(result.statusHints.quote).toBe(jobDetailsCopy.progressStatus.quote.drafted);
  });

  it("surfaces follow-up when AskBob recommends a plan after quote acceptance", () => {
    const result = deriveNextStepForJobDetails(
      buildInput({
        hasDiagnoseSnapshot: true,
        hasMaterialsSnapshot: true,
        latestQuoteId: "quote-1",
        latestQuoteStatus: "accepted",
        followupSnapshot: {
          recommendedAction: "followup",
          rationale: "Stay in touch",
          steps: [],
          shouldCall: false,
          shouldSendMessage: true,
          shouldScheduleVisit: false,
          shouldWait: false,
          callRecommended: false,
        },
      }),
    );
    expect(result.stepType).toBe("followup");
    expect(result.primaryCta?.actionTarget).toBe("progress-followup");
  });

  it("recommends a call when AskBob marks it as the next action", () => {
    const result = deriveNextStepForJobDetails(
      buildInput({
        hasDiagnoseSnapshot: true,
        hasMaterialsSnapshot: true,
        latestQuoteId: "quote-1",
        latestQuoteStatus: "accepted",
        callRecommended: true,
      }),
    );
    expect(result.stepType).toBe("call");
    expect(result.primaryCta?.actionTarget).toBe("progress-call");
  });

  it("moves to invoice when the quote is accepted and no invoice exists", () => {
    const result = deriveNextStepForJobDetails(
      buildInput({
        hasDiagnoseSnapshot: true,
        hasMaterialsSnapshot: true,
        latestQuoteId: "quote-1",
        latestQuoteStatus: "accepted",
        invoicePresent: false,
      }),
    );
    expect(result.stepType).toBe("invoice");
    expect(result.primaryCta?.actionTarget).toBe("invoice-section");
  });

  it("reports done when the pipeline is complete", () => {
    const result = deriveNextStepForJobDetails(
      buildInput({
        hasDiagnoseSnapshot: true,
        hasMaterialsSnapshot: true,
        latestQuoteId: "quote-1",
        latestQuoteStatus: "accepted",
        invoicePresent: true,
        invoiceStatus: "paid",
      }),
    );
    expect(result.stepType).toBe("done");
    expect(result.primaryCta).toBeNull();
    expect(result.rationale).not.toBe("");
  });
});
