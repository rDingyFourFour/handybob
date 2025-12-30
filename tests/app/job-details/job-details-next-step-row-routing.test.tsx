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
import * as nextStepModule from "@/lib/domain/askbob/nextStep";
import type { JobProgressStep, NextStepResult, NextStepStatusHints } from "@/lib/domain/askbob/nextStep";
import { PROGRESS_STEP_ANCHORS } from "@/lib/domain/askbob/progressSteps";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";

const NEXT_STEP_STATUS_HINTS: NextStepStatusHints = {
  diagnose: "Diagnosis pending",
  materials: "Materials pending",
  quote: "Quote pending",
  followup: "Follow-up pending",
  call: "Call pending",
};

describe("JobDetails next step row routing", () => {
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

  it.each<JobProgressStep>(["materials", "followup"])(
    "clicking the Next Step CTA expands the %s row and scrolls into view",
    async (stepKey) => {
      const nextStepResult: NextStepResult = {
        stepType: stepKey,
        rationale: "Test rationale",
        primaryCta: {
          kind: "progress-step",
          label: jobDetailsCopy.nextStepCta[stepKey],
          actionTarget: PROGRESS_STEP_ANCHORS[stepKey],
        },
        statusHints: NEXT_STEP_STATUS_HINTS,
      };
      const deriveSpy = vi
        .spyOn(nextStepModule, "deriveNextStepForJobDetails")
        .mockImplementation(() => nextStepResult);
      const scrollMock = vi.fn();
      const fakeTarget = { scrollIntoView: scrollMock } as HTMLElement;
      const originalGetElementById = document.getElementById;
      document.getElementById = ((id: string) =>
        originalGetElementById?.call(document, id) ?? fakeTarget) as typeof document.getElementById;
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
        const primaryCta = container.querySelector<HTMLButtonElement>(
          '[data-testid="job-details-next-step-primary-cta"]',
        );
        expect(primaryCta).toBeTruthy();
        act(() => {
          primaryCta?.click();
        });
        await Promise.resolve();
        await Promise.resolve();

        const rowBody = container.querySelector(
          `[data-testid="job-progress-row-body-${stepKey}"]`,
        );
        expect(rowBody).toBeTruthy();
        const rowContent = rowBody?.closest('[data-testid$="-content"]');
        expect(rowContent?.getAttribute("aria-hidden")).toBe("false");
        expect(scrollMock).toHaveBeenCalledTimes(1);
      } finally {
        deriveSpy.mockRestore();
        document.getElementById = originalGetElementById;
        act(() => {
          root.unmount();
        });
      }
    },
  );
});
