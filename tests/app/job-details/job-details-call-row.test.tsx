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

describe("JobDetails call row", () => {
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

  it("renders only the call session doorway action inside the call row", async () => {
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
      const callToggle = container.querySelector<HTMLButtonElement>(
        '[data-testid="progress-row-call-toggle"]',
      );
      act(() => {
        callToggle?.click();
      });
      const callContent = container.querySelector('[data-testid="progress-row-call-content"]');
      expect(callContent).toBeTruthy();
      const buttons = callContent?.querySelectorAll("button");
      expect(buttons?.length).toBe(1);
      expect(buttons?.[0]?.textContent).toContain("Open call session");
    } finally {
      logSpy.mockRestore();
      act(() => {
        root.unmount();
      });
    }
  });
});
