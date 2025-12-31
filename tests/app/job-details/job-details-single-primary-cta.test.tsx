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
import { deriveNextStepForJobDetails } from "@/lib/domain/askbob/nextStep";
import { deriveJobNextInstructionFromResult } from "@/lib/domain/askbob/jobNextInstruction";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";

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
    const nextStepIndex = topSection.indexOf('data-testid="job-details-next-step"');
    const ctaIndex = topSection.indexOf('data-testid="job-details-next-step-primary-cta"');
    expect(nextStepIndex).toBeGreaterThan(-1);
    expect(ctaIndex).toBeGreaterThan(nextStepIndex);
  });
});

describe("Next Step copy matches derived output", () => {
  const scenarioQuotes = {
    quoteDraft: [
      {
        id: "quote-draft",
        status: "draft",
        total: 0,
        created_at: new Date().toISOString(),
      },
    ],
  };

  const scenarios = [
    {
      label: "diagnose step",
      hasDiagnoseSnapshot: false,
      hasMaterialsSnapshot: false,
      quotes: [],
    },
    {
      label: "materials step",
      hasDiagnoseSnapshot: true,
      hasMaterialsSnapshot: false,
      quotes: [],
    },
    {
      label: "quote step",
      hasDiagnoseSnapshot: true,
      hasMaterialsSnapshot: true,
      quotes: scenarioQuotes.quoteDraft,
    },
  ] as const;

  const setupSupabase = (quotes: Array<{ id: string; status: string; total: number; created_at: string }>) => {
    createSupabaseState({
      jobs: { data: [JOB_RECORD], error: null },
      appointments: { data: [], error: null },
      quotes: { data: quotes, error: null },
      invoices: { data: [], error: null },
    }).supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    };
  };

  beforeEach(() => {
    setupSupabase([]);
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
    mockGetJobAskBobSnapshotHistoryForJob.mockResolvedValue({
      diagnose: [],
      materials: [],
      quote: [],
    });
    mockLoadCallHistoryForJob.mockResolvedValue([]);
    mockGetLatestCallOutcomeForJob.mockResolvedValue(null);
  });

  const scenarioCases = scenarios.map((scenario) => [scenario.label, scenario] as const);

  it.each(scenarioCases)(
    "renders the derived CTA label and rationale for %s",
    async (_label, scenario) => {
      setupSupabase(scenario.quotes);
      mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
        diagnoseSnapshot: scenario.hasDiagnoseSnapshot ? diagnoseSnapshotStub : null,
        materialsSnapshot: scenario.hasMaterialsSnapshot ? materialsSnapshotStub : null,
        quoteSnapshot: null,
        followupSnapshot: null,
        afterCallSnapshot: null,
        postCallEnrichmentSnapshot: null,
      });

      const markup = await renderJobDetailPage();
      const container = document.createElement("div");
      container.innerHTML = markup;

      const nextStep = deriveNextStepForJobDetails({
        hasDiagnoseSnapshot: scenario.hasDiagnoseSnapshot,
        hasMaterialsSnapshot: scenario.hasMaterialsSnapshot,
        latestQuoteId: scenario.quotes[0]?.id ?? null,
        latestQuoteStatus: scenario.quotes[0]?.status ?? null,
        followupSnapshot: null,
        callRecommended: false,
        hasCallWithMissingOutcome: false,
        latestCallOutcomeRecorded: false,
        invoiceStatus: null,
        invoicePresent: false,
      });
      const instruction = deriveJobNextInstructionFromResult(nextStep, {
        statement: jobDetailsCopy.nextStep.statement,
        supportingRationale: jobDetailsCopy.nextStep.confirmation,
        fallbackRecommendation: jobDetailsCopy.nextStep.fallbackRationale,
      });

      const cta = container.querySelector<HTMLButtonElement>(
        '[data-testid="job-details-next-step-primary-cta"]',
      );
      expect(cta?.textContent?.trim()).toBe(instruction.primaryCta?.label ?? "");

      const rationale = container.querySelector<HTMLElement>(
        '[data-testid="job-details-next-step-rationale"]',
      );
      expect(rationale?.textContent?.trim()).toBe(instruction.recommendation);
    },
  );
});
