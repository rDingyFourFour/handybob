import { act } from "react";
import { createRoot } from "react-dom/client";
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
} from "./test-helpers";
import JobDetailPage from "@/app/(app)/jobs/[id]/page";

describe("JobDetails telemetry events", () => {
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

  it("logs next step and summary interactions once per action", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const element = await JobDetailPage({
      params: Promise.resolve({ id: JOB_RECORD.id }),
      searchParams: Promise.resolve({}),
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      act(() => {
        root.render(element);
      });
      expect(
        logSpy.mock.calls.filter(([name]) => name === "[job-details-next-step-rendered]"),
      ).toHaveLength(1);

      const ctaButton = container.querySelector('[data-testid="job-details-next-step-primary-cta"]');
      act(() => ctaButton?.click());
      expect(
        logSpy.mock.calls.filter(([name]) => name === "[job-details-next-step-primary-cta-click]"),
      ).toHaveLength(1);

      const summaryToggle = container.querySelector('[data-testid="job-details-askbob-summary-toggle"]');
      act(() => summaryToggle?.click());
      act(() => summaryToggle?.click());
      expect(
        logSpy.mock.calls.filter(([name]) => name === "[job-details-askbob-summary-expanded]"),
      ).toHaveLength(1);
      expect(
        logSpy.mock.calls.filter(([name]) => name === "[job-details-askbob-summary-collapsed]"),
      ).toHaveLength(1);
    } finally {
      logSpy.mockRestore();
      act(() => {
        root.unmount();
      });
    }
  });
});
