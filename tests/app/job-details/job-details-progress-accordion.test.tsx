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
  renderJobDetailPage,
} from "./test-helpers";
import JobDetailPage from "@/app/(app)/jobs/[id]/page";
import { PROGRESS_STEPS } from "@/app/(app)/jobs/[id]/progressSteps";
import * as nextStepModule from "@/lib/domain/askbob/nextStep";
import type { NextStepResult, NextStepStatusHints } from "@/lib/domain/askbob/nextStep";

const NEXT_STEP_STATUS_HINTS: NextStepStatusHints = {
  diagnose: "Diagnosis pending",
  materials: "Materials pending",
  quote: "Quote pending",
  followup: "Follow-up pending",
  call: "Call pending",
};

describe("JobDetails progress accordion", () => {
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

  it("renders the accordion rows and logs toggle telemetry", async () => {
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
      const accordion = container.querySelector('[data-testid="progress-accordion"]');
      expect(accordion).toBeTruthy();
      const rowSections = Array.from(
        container.querySelectorAll('section[data-testid^="progress-row-"]'),
      );
      expect(rowSections).toHaveLength(PROGRESS_STEPS.length);
      const rowIds = rowSections.map((node) => node.getAttribute("data-testid"));
      expect(rowIds).toStrictEqual(PROGRESS_STEPS.map((step) => `progress-row-${step.key}`));

      const expandedRows = () =>
        Array.from(container.querySelectorAll('[data-testid$="-content"]')).filter(
          (node) => node.getAttribute("aria-hidden") === "false",
        );
      expect(expandedRows()).toHaveLength(1);
      expect(expandedRows()[0]).toBe(
        container.querySelector('[data-testid="progress-row-diagnose-content"]'),
      );

      const diagnoseToggle = container.querySelector<HTMLButtonElement>(
        '[data-testid="progress-row-diagnose-toggle"]',
      );
      act(() => {
        diagnoseToggle?.click();
      });

      expect(expandedRows()).toHaveLength(0);

      const collapseCall = logSpy.mock.calls.find(
        ([name, payload]) =>
          name === "[job-details-progress-row-collapse]" &&
          (payload as Record<string, unknown>)?.stepKey === "diagnose",
      );
      expect(collapseCall).toBeTruthy();
      const expandCallsSoFar = logSpy.mock.calls.filter(
        ([name]) => name === "[job-details-progress-row-expand]",
      );
      expect(expandCallsSoFar).toHaveLength(0);

      const materialsToggle = container.querySelector<HTMLButtonElement>(
        '[data-testid="progress-row-materials-toggle"]',
      );
      act(() => {
        materialsToggle?.click();
      });
      const collapseCallAfterMaterials = logSpy.mock.calls.find(
        ([name]) => name === "[job-details-progress-row-collapse]",
      );
      expect(collapseCallAfterMaterials?.[1]).toEqual(
        expect.objectContaining({ stepKey: "diagnose" }),
      );
      const expandCalls = logSpy.mock.calls.filter(
        ([name]) => name === "[job-details-progress-row-expand]",
      );
      const secondExpandPayload = expandCalls[expandCalls.length - 1]?.[1];
      expect(secondExpandPayload).toEqual(
        expect.objectContaining({ stepKey: "materials" }),
      );
      expect(expandedRows()).toHaveLength(1);
      expect(expandedRows()[0]).toBe(
        container.querySelector('[data-testid="progress-row-materials-content"]'),
      );
    } finally {
      logSpy.mockRestore();
      act(() => {
        root.unmount();
      });
    }
  });

  it.each(PROGRESS_STEPS.map((step) => step.key))(
    "uses the derived next step to expand the %s row",
    async (stepKey) => {
      const nextStepResult: NextStepResult = {
        stepType: stepKey,
        rationale: "Test rationale",
        primaryCta: null,
        statusHints: NEXT_STEP_STATUS_HINTS,
      };
      const deriveSpy = vi
        .spyOn(nextStepModule, "deriveNextStepForJobDetails")
        .mockImplementation(() => nextStepResult);
      const markup = await renderJobDetailPage();
      expect(markup).toContain(
        `data-testid="progress-row-${stepKey}-content" aria-hidden="false"`,
      );
      for (const other of PROGRESS_STEPS.filter((step) => step.key !== stepKey)) {
        expect(markup).toContain(
          `data-testid="progress-row-${other.key}-content" aria-hidden="true"`,
        );
      }
      deriveSpy.mockRestore();
    },
  );

  it("leaves all rows collapsed when the next step is done", async () => {
    const nextStepResult: NextStepResult = {
      stepType: "done",
      rationale: "All caught up",
      primaryCta: null,
      statusHints: NEXT_STEP_STATUS_HINTS,
    };
    const deriveSpy = vi
      .spyOn(nextStepModule, "deriveNextStepForJobDetails")
      .mockImplementation(() => nextStepResult);
    const markup = await renderJobDetailPage();
    for (const step of PROGRESS_STEPS) {
      expect(markup).toContain(
        `data-testid="progress-row-${step.key}-content" aria-hidden="true"`,
      );
    }
    deriveSpy.mockRestore();
  });

  it("keeps only one accordion row open and logs each transition", async () => {
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
      const expandedRows = () =>
        Array.from(container.querySelectorAll('[data-testid$="-content"]')).filter(
          (node) => node.getAttribute("aria-hidden") === "false",
        );
      expect(expandedRows()).toHaveLength(1);

      const diagnoseToggle = container.querySelector<HTMLButtonElement>(
        '[data-testid="progress-row-diagnose-toggle"]',
      );
      act(() => {
        diagnoseToggle?.click();
      });
      expect(expandedRows()).toHaveLength(0);
      const collapseCalls = logSpy.mock.calls.filter(
        ([name]) => name === "[job-details-progress-row-collapse]",
      );
      expect(collapseCalls.length).toBeGreaterThanOrEqual(1);

      const materialsToggle = container.querySelector<HTMLButtonElement>(
        '[data-testid="progress-row-materials-toggle"]',
      );
      act(() => {
        materialsToggle?.click();
      });
      expect(expandedRows()).toHaveLength(1);
      expect(container.querySelector('[data-testid="progress-row-diagnose-content"]')?.getAttribute("aria-hidden")).toBe(
        "true",
      );
      const expandCalls = logSpy.mock.calls.filter(
        ([name]) => name === "[job-details-progress-row-expand]",
      );
      expect(expandCalls.length).toBeGreaterThanOrEqual(1);

      act(() => {
        materialsToggle?.click();
      });
      expect(expandedRows()).toHaveLength(0);
      const collapseCountAfterSecond = logSpy.mock.calls.filter(
        ([name]) => name === "[job-details-progress-row-collapse]",
      );
      expect(collapseCountAfterSecond.length).toBeGreaterThanOrEqual(2);
    } finally {
      logSpy.mockRestore();
      act(() => {
        root.unmount();
      });
    }
  });
});
