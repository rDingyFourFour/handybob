import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AskBobDiagnoseSnapshotPayload,
  AskBobMaterialsSnapshotPayload,
} from "@/lib/domain/askbob/types";
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

const diagnoseSnapshotStub: AskBobDiagnoseSnapshotPayload = {
  sessionId: "snapshot-1",
  responseId: "response-1",
  createdAt: new Date().toISOString(),
  sections: [],
};

const materialsSnapshotStub: AskBobMaterialsSnapshotPayload = {
  items: [],
};

describe("JobDetails single primary CTA guard", () => {
  beforeEach(() => {
    createSupabaseState({
      jobs: { data: [JOB_RECORD], error: null },
      appointments: { data: [], error: null },
      quotes: {
        data: [
          {
            id: "quote-1",
            status: "draft",
            total: 100,
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      },
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
      diagnoseSnapshot: diagnoseSnapshotStub,
      materialsSnapshot: materialsSnapshotStub,
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

  it("renders only the next step CTA above the job progress header", async () => {
    const markup = await renderJobDetailPage();
    const headerIndex = markup.indexOf('data-testid="job-details-job-progress-header"');
    expect(headerIndex).toBeGreaterThan(-1);

    const topSection = markup.slice(0, headerIndex);
    const primaryCtaMatches = topSection.match(/data-testid="[^"]*primary-cta"/g) ?? [];
    expect(primaryCtaMatches).toHaveLength(1);
    expect(primaryCtaMatches[0]).toContain("job-details-next-step-primary-cta");
  });
});
