import { describe, expect, it } from "vitest";

import type { AskBobFollowupSnapshotPayload } from "@/lib/domain/askbob/types";
import { deriveHomeInstruction, type HomeInstructionCandidate } from "@/lib/domain/askbob/homeInstruction";
import { assertBobTone } from "@/lib/domain/copy/bobVoice";

const now = new Date().toISOString();

function buildCandidate(overrides: Partial<HomeInstructionCandidate> = {}): HomeInstructionCandidate {
  return {
    jobId: "job-voice",
    title: "Voice job",
    status: "open",
    updatedAt: now,
    createdAt: now,
    lastActivityAt: now,
    hasDiagnoseSnapshot: true,
    hasMaterialsSnapshot: true,
    latestQuoteId: "quote-voice",
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
  recommendedAction: "Follow-up",
  rationale: "Keep the customer in the loop.",
  steps: [],
  shouldSendMessage: true,
  shouldScheduleVisit: false,
  shouldCall: false,
  shouldWait: false,
  modelLatencyMs: 1,
};

describe("home instruction Bob tone", () => {
  it("keeps derived recommendations in Bob tone", () => {
    const instruction = deriveHomeInstruction([
      buildCandidate({
        followupSnapshot,
        latestQuoteStatus: "accepted",
      }),
    ]);
    expect(instruction).toBeTruthy();
    if (instruction) {
      expect(() =>
        assertBobTone(instruction.instruction.recommendation, "homeInstruction.voice"),
      ).not.toThrow();
    }
  });
});
