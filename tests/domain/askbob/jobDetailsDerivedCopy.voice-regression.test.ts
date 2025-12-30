import type { CallSummarySignals } from "@/lib/domain/askbob/callHistory";
import { deriveNextStepForJobDetails, type NextStepInput } from "@/lib/domain/askbob/nextStep";
import { deriveJobDetailsAskBobDerivedCopy } from "@/lib/domain/askbob/jobDetailsDerivedCopy";
import { assertBobTone } from "@/lib/domain/copy/bobVoice";
import { describe, it } from "vitest";

const baseInput: NextStepInput = {
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
};

const hudSummary = {
  lastTaskLabel: "Diagnosis",
  lastUsedAt: "2023-01-01T00:00:00Z",
  totalRunsCount: 1,
  tasksSeen: ["Diagnosis"],
};

const callSignals: CallSummarySignals = {
  totalAttempts: 1,
  answeredCount: 1,
  voicemailCount: 0,
  lastOutcome: "answered",
  lastAttemptAt: "2023-01-02T00:00:00Z",
  bestGuessRetryWindow: null,
};

const scenarios: Array<{ label: string; overrides: Partial<NextStepInput>; callSignals?: CallSummarySignals | null }> = [
  { label: "early stage", overrides: {} },
  { label: "mid stage", overrides: { hasDiagnoseSnapshot: true, hasMaterialsSnapshot: true } },
  { label: "late stage", overrides: { hasDiagnoseSnapshot: true, hasMaterialsSnapshot: true, latestQuoteId: "quote-1", latestQuoteStatus: "accepted" }, callSignals },
];

function buildDerived(inputOverrides: Partial<NextStepInput>, callSignalsOverride?: CallSummarySignals | null) {
  const nextStepInput: NextStepInput = { ...baseInput, ...inputOverrides };
  const nextStep = deriveNextStepForJobDetails(nextStepInput);
  return deriveJobDetailsAskBobDerivedCopy({
    nextStep,
    hudSummary,
    hasDiagnoseSnapshot: Boolean(nextStepInput.hasDiagnoseSnapshot),
    hasMaterialsSnapshot: Boolean(nextStepInput.hasMaterialsSnapshot),
    hasQuoteSnapshot: Boolean(nextStepInput.latestQuoteId),
    hasFollowupSnapshot: Boolean(nextStepInput.followupSnapshot),
    hasCallSummary: Boolean(callSignalsOverride),
    callSummarySignals: callSignalsOverride ?? null,
  });
}

describe("Job details derived copy voice regression", () => {
  it("keeps each derived string calm across pipeline stages", () => {
    for (const scenario of scenarios) {
      const derived = buildDerived(scenario.overrides, scenario.callSignals);
      assertBobTone(derived.askBobSummary.collapsedLine, `${scenario.label}.summary`);
      assertBobTone(derived.askBobHudActivityLine, `${scenario.label}.hud`);
      if (derived.askBobHudScopeHint) {
        assertBobTone(derived.askBobHudScopeHint, `${scenario.label}.hudScope`);
      }
      if (derived.callHistoryHint) {
        assertBobTone(derived.callHistoryHint, `${scenario.label}.callHistory`);
      }
      for (const status of Object.values(derived.progressRowStatuses)) {
        assertBobTone(status, `${scenario.label}.status`);
      }
      for (const ctaLabel of Object.values(derived.progressRowSecondaryCtaLabels)) {
        assertBobTone(ctaLabel, `${scenario.label}.cta`);
      }
    }
  });
});
