import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "./test-helpers";
import JobDetailPage from "@/app/(app)/jobs/[id]/page";
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

describe("JobDetails AskBob summary expand", () => {
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

  it("expands the AskBob summary and logs telemetry on toggle", async () => {
    const element = await JobDetailPage({
      params: Promise.resolve({ id: JOB_RECORD.id }),
      searchParams: Promise.resolve({}),
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      act(() => {
        root.render(element);
      });
      const toggle = container.querySelector<HTMLButtonElement>(
        '[data-testid="job-details-askbob-summary-toggle"]',
      );
      expect(toggle).toBeTruthy();
      act(() => {
        toggle?.click();
      });
      expect(container.querySelector('[data-testid="job-details-askbob-summary-expanded"]')).toBeTruthy();
      const expandedTelemetry = logSpy.mock.calls.find(
        ([name]) => name === "[job-details-askbob-summary-expanded]",
      );
      expect(expandedTelemetry).toBeTruthy();
      const payload = expandedTelemetry?.[1];
      expect(payload).toEqual(
        expect.objectContaining({
          jobId: JOB_RECORD.id,
          stepType: expect.any(String),
        }),
      );
    } finally {
      logSpy.mockRestore();
      act(() => {
        root.unmount();
      });
    }
  });
});
