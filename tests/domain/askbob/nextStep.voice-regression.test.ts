import { describe, it } from "vitest";

import { assertBobTone } from "@/lib/domain/copy/bobVoice";
import { deriveNextStepForJobDetails, type NextStepInput } from "@/lib/domain/askbob/nextStep";

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

const regressionCases = [
  {
    label: "early stage (diagnose)",
    overrides: {},
  },
  {
    label: "mid stage (quote)",
    overrides: {
      hasDiagnoseSnapshot: true,
      hasMaterialsSnapshot: true,
    },
  },
  {
    label: "late stage (call)",
    overrides: {
      hasDiagnoseSnapshot: true,
      hasMaterialsSnapshot: true,
      latestQuoteId: "quote-1",
      latestQuoteStatus: "accepted",
      callRecommended: true,
    },
  },
];

describe("next step voice regression", () => {
  it("keeps derived rationale and CTA calm across pipeline stages", () => {
    for (const scenario of regressionCases) {
      const result = deriveNextStepForJobDetails(buildInput(scenario.overrides));
      assertBobTone(result.rationale, `nextStep.rationale.${result.stepType}`);
      if (result.primaryCta) {
        assertBobTone(result.primaryCta.label, `nextStep.primaryCta.${result.stepType}`);
      }
    }
  });
});
