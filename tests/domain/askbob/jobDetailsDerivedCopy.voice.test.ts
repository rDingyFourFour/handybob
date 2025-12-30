import { assertBobTone } from "@/lib/domain/copy/bobVoice";
import { deriveJobDetailsAskBobDerivedCopy } from "@/lib/domain/askbob/jobDetailsDerivedCopy";
import { deriveNextStepForJobDetails, type NextStepInput } from "@/lib/domain/askbob/nextStep";
import { describe, it } from "vitest";

const baseInput: NextStepInput = {
  hasDiagnoseSnapshot: true,
  hasMaterialsSnapshot: true,
  latestQuoteId: null,
  latestQuoteStatus: null,
  followupSnapshot: null,
  callRecommended: false,
  hasCallWithMissingOutcome: false,
  latestCallOutcomeRecorded: false,
  invoiceStatus: null,
  invoicePresent: false,
};

const hudSummary = {
  lastTaskLabel: null,
  lastUsedAt: null,
  totalRunsCount: 0,
  tasksSeen: [] as string[],
};

describe("jobDetailsDerivedCopy voice guard", () => {
  it("ensures summary display strings keep the tone", () => {
    const nextStep = deriveNextStepForJobDetails(baseInput);
    const derived = deriveJobDetailsAskBobDerivedCopy({
      nextStep,
      hudSummary,
      hasDiagnoseSnapshot: true,
      hasMaterialsSnapshot: true,
      hasQuoteSnapshot: false,
      hasFollowupSnapshot: false,
      hasCallSummary: false,
      callSummarySignals: null,
    });

    const summary = derived.askBobSummary;
    assertBobTone(summary.collapsedHint, "derived.askBobSummary.collapsedHint");
    assertBobTone(summary.expandedHint, "derived.askBobSummary.expandedHint");
    assertBobTone(summary.toggleLabels.expand, "derived.askBobSummary.toggle.expand");
    assertBobTone(summary.toggleLabels.collapse, "derived.askBobSummary.toggle.collapse");
    assertBobTone(summary.collapsedLine, "derived.askBobSummary.collapsedLine");

    for (const row of summary.rows) {
      assertBobTone(row.label, `derived.askBobSummary.rows.${row.key}.label`);
      assertBobTone(row.statusHint, `derived.askBobSummary.rows.${row.key}.statusHint`);
      assertBobTone(row.reviewActionLabel, `derived.askBobSummary.rows.${row.key}.reviewActionLabel`);
    }
  });
});
