import { describe, expect, it } from "vitest";

import type { AskBobFollowupSnapshotPayload } from "@/lib/domain/askbob/types";
import { deriveHomeInstruction, type HomeInstructionCandidate } from "@/lib/domain/askbob/homeInstruction";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";

const now = new Date().toISOString();

function buildCandidate(overrides: Partial<HomeInstructionCandidate> = {}): HomeInstructionCandidate {
  return {
    jobId: "job-1",
    title: "Test job",
    status: "open",
    updatedAt: now,
    createdAt: now,
    lastActivityAt: now,
    hasDiagnoseSnapshot: true,
    hasMaterialsSnapshot: true,
    latestQuoteId: "quote-1",
    latestQuoteStatus: "drafted",
    followupSnapshot: null,
    callRecommended: false,
    hasCallWithMissingOutcome: false,
    latestCallOutcomeRecorded: false,
    invoicePresent: false,
    invoiceStatus: null,
    ...overrides,
  };
}

const followupSnapshot: AskBobFollowupSnapshotPayload = {
  recommendedAction: "Send a follow-up",
  rationale: "Check in to confirm the quoted price.",
  steps: [],
  shouldSendMessage: true,
  shouldScheduleVisit: false,
  shouldCall: false,
  shouldWait: false,
  modelLatencyMs: 1,
};

describe("deriveHomeInstruction", () => {
  it("prefers actionable follow-up over jobs that are done", () => {
    const followupCandidate = buildCandidate({
      jobId: "job-followup",
      followupSnapshot,
      latestQuoteStatus: "accepted",
    });
    const doneCandidate = buildCandidate({
      jobId: "job-done",
      latestQuoteStatus: "accepted",
      invoicePresent: true,
      invoiceStatus: "paid",
      followupSnapshot: null,
    });
    const instruction = deriveHomeInstruction([doneCandidate, followupCandidate]);
    expect(instruction?.jobId).toBe("job-followup");
  });

  it("prioritizes call recommendations over jobs stuck on quote", () => {
    const callCandidate = buildCandidate({
      jobId: "job-call",
      latestQuoteStatus: "accepted",
      callRecommended: true,
      followupSnapshot: null,
    });
    const quoteCandidate = buildCandidate({
      jobId: "job-quote",
      latestQuoteStatus: "drafted",
      callRecommended: false,
      followupSnapshot: null,
    });
    const instruction = deriveHomeInstruction([quoteCandidate, callCandidate]);
    expect(instruction?.jobId).toBe("job-call");
  });

  it("returns null when no actionable jobs exist", () => {
    const doneCandidate = buildCandidate({
      jobId: "job-done",
      latestQuoteStatus: "accepted",
      invoicePresent: true,
      invoiceStatus: "paid",
      followupSnapshot: null,
    });
    expect(deriveHomeInstruction([doneCandidate])).toBeNull();
  });

  it("reuses the canonical CTA label when an instruction exists", () => {
    const followupCandidate = buildCandidate({
      jobId: "job-followup",
      followupSnapshot,
      latestQuoteStatus: "accepted",
    });
    const instruction = deriveHomeInstruction([followupCandidate]);
    expect(instruction?.instruction.primaryCta?.label).toBe(mobileFlowCopy.home.recommendationCtaLabel);
    expect(instruction?.instruction.primaryCta?.href).toBe(`/m/jobs/${followupCandidate.jobId}`);
    expect(instruction?.instruction.stepType).toBe("followup");
  });
});
