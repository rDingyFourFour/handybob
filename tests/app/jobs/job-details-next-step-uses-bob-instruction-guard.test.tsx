import { beforeEach, describe, expect, it, vi } from "vitest";

import { deriveJobNextInstructionFromResult } from "@/lib/domain/askbob/jobNextInstruction";
import { deriveNextStepForJobDetails } from "@/lib/domain/askbob/nextStep";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import {
  createSupabaseState,
  JOB_RECORD,
  mockGetJobAskBobHudSummary,
  mockGetJobAskBobSnapshotHistoryForJob,
  mockGetJobAskBobSnapshotsForJob,
  mockGetLatestCallOutcomeForJob,
  mockLoadCallHistoryForJob,
  mockResolveWorkspaceContext,
  renderJobDetailPage,
} from "../job-details/test-helpers";

describe("Job Details next step BobInstruction guard", () => {
  beforeEach(() => {
    createSupabaseState({
      jobs: { data: [JOB_RECORD], error: null },
      appointments: { data: [], error: null },
      quotes: { data: [], error: null },
      invoices: { data: [], error: null },
    }).supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    };
    mockResolveWorkspaceContext.mockReset();
    mockGetJobAskBobHudSummary.mockReset();
    mockGetJobAskBobSnapshotsForJob.mockReset();
    mockGetJobAskBobSnapshotHistoryForJob.mockReset();
    mockLoadCallHistoryForJob.mockReset();
    mockGetLatestCallOutcomeForJob.mockReset();

    mockResolveWorkspaceContext.mockResolvedValue({
      ok: true,
      workspaceId: "workspace-1",
      userId: "user-1",
      membership: {
        user: { id: "user-1" },
        workspace: { id: "workspace-1" },
        role: "owner",
      },
    });
    mockGetJobAskBobHudSummary.mockResolvedValue({
      lastTaskLabel: null,
      lastUsedAt: null,
      totalRunsCount: 0,
      tasksSeen: [],
    });
    mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
      diagnoseSnapshot: null,
      materialsSnapshot: null,
      quoteSnapshot: null,
      followupSnapshot: null,
      afterCallSnapshot: null,
      postCallEnrichmentSnapshot: null,
    });
    mockGetJobAskBobSnapshotHistoryForJob.mockResolvedValue({
      diagnose: [],
      materials: [],
      quote: [],
    });
    mockLoadCallHistoryForJob.mockResolvedValue([]);
    mockGetLatestCallOutcomeForJob.mockResolvedValue(null);
  });

  it("renders a single CTA with BobInstruction copy and telemetry metadata", async () => {
    const markup = await renderJobDetailPage();
    const primaryCtaMatches = markup.match(/data-testid="job-details-next-step-primary-cta"/g) ?? [];
    expect(primaryCtaMatches).toHaveLength(1);

    const expectedNextStepInput = {
      hasDiagnoseSnapshot: false,
      hasMaterialsSnapshot: false,
      latestQuoteId: null,
      latestQuoteStatus: null,
      followupSnapshot: null,
      callRecommended: false,
      hasCallWithMissingOutcome: false,
      latestCallOutcomeRecorded: false,
      invoicePresent: false,
      invoiceStatus: null,
    };
    const nextStep = deriveNextStepForJobDetails(expectedNextStepInput);
    const expectedInstruction = deriveJobNextInstructionFromResult(nextStep, {
      supportingRationale: jobDetailsCopy.nextStep.confirmation,
      fallbackRecommendation: jobDetailsCopy.nextStep.fallbackRationale,
    });

    expect(markup).toContain(expectedInstruction.statement);
    expect(markup).toContain(expectedInstruction.recommendation);

    const stepTypeMatch = markup.match(/data-instruction-step-type="([^"]+)"/);
    expect(stepTypeMatch?.[1]).toBe(expectedInstruction.stepType);
    const hasPrimaryCtaMatch = markup.match(/data-instruction-has-primary-cta="([^"]+)"/);
    expect(hasPrimaryCtaMatch?.[1]).toBe("true");
  });
});
