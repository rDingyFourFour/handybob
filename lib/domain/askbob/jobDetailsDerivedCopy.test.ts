import type { CallSummarySignals } from "@/lib/domain/askbob/callHistory";
import { deriveNextStepForJobDetails, type JobProgressStep, type NextStepInput } from "@/lib/domain/askbob/nextStep";
import {
  deriveJobDetailsAskBobDerivedCopy,
  buildJobBriefDisplayModel,
} from "@/lib/domain/askbob/jobDetailsDerivedCopy";
import type { AskBobFollowupSnapshotPayload } from "@/lib/domain/askbob/types";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import { assertBobTone } from "@/lib/domain/copy/bobVoice";
import { describe, expect, it } from "vitest";

const BASE_NEXT_STEP_INPUT: NextStepInput = {
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

const BASE_HUD_SUMMARY = {
  lastTaskLabel: null,
  lastUsedAt: null,
  totalRunsCount: 0,
  tasksSeen: [] as string[],
};

const CALL_SIGNALS: CallSummarySignals = {
  totalAttempts: 1,
  answeredCount: 1,
  voicemailCount: 0,
  lastOutcome: "answered",
  lastAttemptAt: "2023-01-01T00:00:00Z",
  bestGuessRetryWindow: "Tomorrow",
};

function buildNextStepInput(overrides: Partial<NextStepInput> = {}): NextStepInput {
  return {
    ...BASE_NEXT_STEP_INPUT,
    ...overrides,
  };
}

function deriveCopy(options: {
  nextStepInput: NextStepInput;
  hasCallSummary?: boolean;
  hudSummary?: typeof BASE_HUD_SUMMARY;
  callSignals?: CallSummarySignals | null;
  followupSnapshot?: AskBobFollowupSnapshotPayload | null;
}) {
  const nextStep = deriveNextStepForJobDetails({
    ...options.nextStepInput,
    followupSnapshot: options.followupSnapshot ?? null,
    hasCallWithMissingOutcome: options.nextStepInput.hasCallWithMissingOutcome,
  });
  const derived = deriveJobDetailsAskBobDerivedCopy({
    nextStep,
    hudSummary: options.hudSummary ?? BASE_HUD_SUMMARY,
    hasDiagnoseSnapshot: Boolean(options.nextStepInput.hasDiagnoseSnapshot),
    hasMaterialsSnapshot: Boolean(options.nextStepInput.hasMaterialsSnapshot),
    hasQuoteSnapshot: Boolean(options.nextStepInput.latestQuoteId),
    hasFollowupSnapshot: Boolean(options.followupSnapshot),
    hasCallSummary: Boolean(options.hasCallSummary),
    callSummarySignals: options.callSignals ?? null,
  });
  return { derived, nextStep };
}

describe("deriveJobDetailsAskBobDerivedCopy", () => {
  it("uses the fallback summary line when no artifacts exist", () => {
    const { derived } = deriveCopy({ nextStepInput: buildNextStepInput() });
    expect(derived.askBobSummary.collapsedLine).toBe(
      "AskBob hasn’t generated any artifacts for this job yet.",
    );
    expect(derived.callHistoryHint).toBeNull();
    assertBobTone(derived.askBobSummary.collapsedLine, "test");
    expect(derived.progressRowStatuses.diagnose).toBe(jobDetailsCopy.progressStatus.diagnose.pending);
    expect(derived.askBobHudActivityLine).toBe("No AskBob activity recorded yet for this job.");
  });

  it("lists multiple artifact labels in the collapsed summary", () => {
    const { derived } = deriveCopy({
      nextStepInput: buildNextStepInput({
        hasDiagnoseSnapshot: true,
        hasMaterialsSnapshot: true,
        latestQuoteId: null,
      }),
      hasCallSummary: true,
    });
    expect(derived.askBobSummary.collapsedLine).toBe(
      "AskBob has generated Diagnosis, Materials, and Call summary.",
    );
    assertBobTone(derived.askBobSummary.collapsedLine, "test");
  });

  it("includes follow-up plan when a followup snapshot exists", () => {
    const followupSnapshot: AskBobFollowupSnapshotPayload = {
      recommendedAction: "followup",
      rationale: "Keep in touch",
      steps: [],
      shouldSendMessage: false,
      shouldScheduleVisit: false,
      shouldCall: false,
      shouldWait: false,
    };
    const { derived } = deriveCopy({
      nextStepInput: buildNextStepInput({
        hasDiagnoseSnapshot: true,
        hasQuoteSnapshot: true,
      }),
      followupSnapshot,
    });
    expect(derived.askBobSummary.collapsedLine).toContain("Follow-up plan");
    assertBobTone(derived.askBobSummary.collapsedLine, "test");
  });

  it("generates a call history hint when call signals exist", () => {
    const { derived } = deriveCopy({
      nextStepInput: buildNextStepInput(),
      hasCallSummary: true,
      callSignals: CALL_SIGNALS,
    });
    expect(derived.callHistoryHint).toContain("attempt");
    assertBobTone(derived.callHistoryHint ?? "", "call");
  });

  it("formats the HUD line when AskBob activity exists", () => {
    const { derived } = deriveCopy({
      nextStepInput: buildNextStepInput(),
      hudSummary: {
        lastTaskLabel: "Diagnose",
        lastUsedAt: "2023-01-01T00:00:00Z",
        totalRunsCount: 2,
        tasksSeen: ["Diagnose"],
      },
    });
    expect(derived.askBobHudActivityLine).toContain("Last AskBob activity");
    expect(derived.askBobHudScopeHint).toContain("AskBob can help");
    assertBobTone(derived.askBobHudActivityLine, "hud");
    if (derived.askBobHudScopeHint) {
      assertBobTone(derived.askBobHudScopeHint, "hud-scope");
    }
  });
});

describe("buildJobBriefDisplayModel", () => {
  it("exposes copy-driven headings, CTA, and state when a customer is known", () => {
    const { derived, nextStep } = deriveCopy({
      nextStepInput: buildNextStepInput({
        hasDiagnoseSnapshot: true,
        hasMaterialsSnapshot: true,
        latestQuoteId: "quote-1",
      }),
    });
    const model = buildJobBriefDisplayModel({
      jobTitle: "Urgent repair",
      customerName: "Acme Inc.",
      nextStep,
      progressRowStatuses: derived.progressRowStatuses,
    });

    expect(model.heading).toBe(jobDetailsCopy.jobBrief.heading);
    expect(model.backToJobsLabel).toBe(jobDetailsCopy.jobBrief.backToJobs);
    expect(model.customerLine).toBe(`${jobDetailsCopy.jobBrief.customerLabel}: Acme Inc.`);
    expect(model.jobTitle).toBe("Urgent repair");
    expect(model.stateLine).toBe(derived.progressRowStatuses[nextStep.stepType as JobProgressStep]);
    assertBobTone(model.stateLine, "jobBrief.stateLine");
  });

  it("falls back to the quote status when the next step moves outside the progress steps", () => {
    const nextStep = deriveNextStepForJobDetails({
      hasDiagnoseSnapshot: true,
      hasMaterialsSnapshot: true,
      latestQuoteId: "quote-accepted",
      latestQuoteStatus: "accepted",
      followupSnapshot: null,
      callRecommended: false,
      hasCallWithMissingOutcome: false,
      latestCallOutcomeRecorded: false,
      invoiceStatus: null,
      invoicePresent: false,
    });
    const derived = deriveJobDetailsAskBobDerivedCopy({
      nextStep,
      hudSummary: BASE_HUD_SUMMARY,
      hasDiagnoseSnapshot: true,
      hasMaterialsSnapshot: true,
      hasQuoteSnapshot: true,
      hasFollowupSnapshot: false,
      hasCallSummary: false,
      callSummarySignals: null,
    });
    const model = buildJobBriefDisplayModel({
      jobTitle: "Invoice ready job",
      customerName: null,
      nextStep,
      progressRowStatuses: derived.progressRowStatuses,
    });

    expect(model.customerLine).toBeNull();
    expect(model.stateLine).toBe(derived.progressRowStatuses.quote);
    assertBobTone(model.stateLine, "jobBrief.stateLine");
  });
});
