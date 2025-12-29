import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("JobDetails next step scaffold regression", () => {
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

  it("renders the new scaffolds above the job progress header with AskBob summary collapsed", async () => {
    const markup = await renderJobDetailPage();
    const briefIndex = markup.indexOf('data-testid="job-details-job-brief"');
    const nextIndex = markup.indexOf('data-testid="job-details-next-step"');
    const summaryIndex = markup.indexOf('data-testid="job-details-askbob-summary"');
    const progressIndex = markup.indexOf('data-testid="job-details-job-progress-header"');

    expect(briefIndex).toBeGreaterThan(-1);
    expect(nextIndex).toBeGreaterThan(briefIndex);
    expect(summaryIndex).toBeGreaterThan(nextIndex);
    expect(progressIndex).toBeGreaterThan(summaryIndex);
    expect(markup).toContain('data-testid="job-details-askbob-summary-collapsed"');
    expect(markup).not.toContain('data-testid="job-details-askbob-summary-expanded"');
  });
});
