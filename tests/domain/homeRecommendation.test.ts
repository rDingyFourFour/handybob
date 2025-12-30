import { describe, expect, it } from "vitest";

import type { AskBobFollowupSnapshotPayload } from "@/lib/domain/askbob/types";
import { deriveHomeRecommendation, type HomeRecommendationCandidate } from "@/lib/domain/askbob/homeRecommendation";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";

const now = new Date().toISOString();

function buildCandidate(overrides: Partial<HomeRecommendationCandidate> = {}): HomeRecommendationCandidate {
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

describe("deriveHomeRecommendation", () => {
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
      callRecommended: false,
      followupSnapshot: null,
    });
    const recommendation = deriveHomeRecommendation([doneCandidate, followupCandidate]);
    expect(recommendation?.jobId).toBe("job-followup");
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
    const recommendation = deriveHomeRecommendation([quoteCandidate, callCandidate]);
    expect(recommendation?.jobId).toBe("job-call");
  });

  it("returns null when no actionable jobs exist", () => {
    const doneCandidate = buildCandidate({
      jobId: "job-done",
      latestQuoteStatus: "accepted",
      invoicePresent: true,
      invoiceStatus: "paid",
      callRecommended: false,
      followupSnapshot: null,
    });
    expect(deriveHomeRecommendation([doneCandidate])).toBeNull();
  });

  it("reuses the canonical CTA label and Bob-approved rationale", () => {
    const followupCandidate = buildCandidate({
      jobId: "job-followup",
      followupSnapshot,
      latestQuoteStatus: "accepted",
    });
    const recommendation = deriveHomeRecommendation([followupCandidate]);
    expect(recommendation?.primaryCtaLabel).toBe(
      mobileFlowCopy.home.recommendationCtaLabel,
    );
    expect(recommendation?.rationale).toBe(
      "A follow-up plan is available. Share it with the customer to keep the conversation going.",
    );
  });
});
