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
import { PROGRESS_STEPS } from "@/app/(app)/jobs/[id]/progressSteps";
import type { JobProgressStep } from "@/lib/domain/askbob/nextStep";

const ROW_TEST_IDS: Record<JobProgressStep, string> = {
  diagnose: "askbob-diagnose-section",
  materials: "askbob-materials-section",
  quote: "askbob-quote-section",
  followup: "askbob-followup-section",
  call: "askbob-call-session-section",
};

describe("JobDetails progress panels mounting", () => {
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

  it("renders each AskBob panel inside the matching accordion row", async () => {
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
      expect(container.querySelector('[data-testid="askbob-job-pipeline"]')).toBeNull();
      expect(container.querySelector('[data-testid="askbob-calling-pipeline"]')).toBeNull();

      for (const step of PROGRESS_STEPS) {
        const toggle = container.querySelector<HTMLButtonElement>(
          `[data-testid="progress-row-${step.key}-toggle"]`,
        );
        act(() => {
          toggle?.click();
        });
        const panel = container.querySelector(`[data-testid="${ROW_TEST_IDS[step.key]}"]`);
        expect(panel).toBeTruthy();
        if (step.key === "call") {
          const callRow = container.querySelector('[data-testid="progress-row-call-content"]');
          expect(callRow?.textContent).toContain("Open call session");
          expect(callRow?.textContent).not.toContain("Start automated call");
        }
      }
    } finally {
      act(() => {
        root.unmount();
      });
    }
  });
});
