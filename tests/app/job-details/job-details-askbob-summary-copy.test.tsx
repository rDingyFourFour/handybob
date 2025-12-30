import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeCallSummarySignals } from "@/lib/domain/askbob/callHistory";
import { deriveJobDetailsAskBobDerivedCopy } from "@/lib/domain/askbob/jobDetailsDerivedCopy";
import { deriveNextStepForJobDetails } from "@/lib/domain/askbob/nextStep";
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
} from "./test-helpers";

describe("JobDetails AskBob summary copy", () => {
  const hudSummary = {
    lastTaskLabel: null,
    lastUsedAt: null,
    totalRunsCount: 0,
    tasksSeen: [] as string[],
  };

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
    mockGetJobAskBobHudSummary.mockResolvedValue(hudSummary);
    mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
      diagnoseSnapshot: {
        sessionId: "diag-1",
        responseId: "response-1",
        createdAt: new Date().toISOString(),
        sections: [],
      },
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

  it("renders the collapsed AskBob summary string from derived copy", async () => {
    const markup = await renderJobDetailPage();
    const container = document.createElement("div");
    container.innerHTML = markup;
    const element = container.querySelector<HTMLElement>(
      '[data-testid="job-details-askbob-summary-collapsed"]',
    );
    expect(element).toBeTruthy();

    const scaffolding = deriveJobDetailsAskBobDerivedCopy({
      nextStep: deriveNextStepForJobDetails({
        hasDiagnoseSnapshot: true,
        hasMaterialsSnapshot: false,
        latestQuoteId: null,
        latestQuoteStatus: null,
        followupSnapshot: null,
        callRecommended: false,
        hasCallWithMissingOutcome: false,
        latestCallOutcomeRecorded: false,
        invoiceStatus: null,
        invoicePresent: false,
      }),
      hudSummary,
      hasDiagnoseSnapshot: true,
      hasMaterialsSnapshot: false,
      hasQuoteSnapshot: false,
      hasFollowupSnapshot: false,
      hasCallSummary: false,
      callSummarySignals: computeCallSummarySignals([]),
    });

    expect(element?.textContent?.trim()).toBe(scaffolding.askBobSummary.collapsedLine);
  });
});
