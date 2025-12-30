import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

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
import { computeCallSummarySignals, type CallHistoryRecord } from "@/lib/domain/askbob/callHistory";
import {
  deriveJobDetailsAskBobDerivedCopy,
} from "@/lib/domain/askbob/jobDetailsDerivedCopy";
import { deriveNextStepForJobDetails } from "@/lib/domain/askbob/nextStep";
import type {
  AskBobDiagnoseSnapshotPayload,
  AskBobMaterialsSnapshotPayload,
  AskBobQuoteSnapshotPayload,
  AskBobFollowupSnapshotPayload,
} from "@/lib/domain/askbob/types";

const BASE_HUD_SUMMARY = {
  lastTaskLabel: null,
  lastUsedAt: null,
  totalRunsCount: 0,
  tasksSeen: [] as string[],
};

const DIAGNOSE_SNAPSHOT: AskBobDiagnoseSnapshotPayload = {
  sessionId: "diag-1",
  responseId: "response-1",
  createdAt: "2023-01-01T00:00:00Z",
  sections: [],
};

const MATERIALS_SNAPSHOT: AskBobMaterialsSnapshotPayload = {
  items: [],
};

const QUOTE_SNAPSHOT: AskBobQuoteSnapshotPayload = {
  lines: [],
  materials: [],
  notes: null,
};

const FOLLOWUP_SNAPSHOT: AskBobFollowupSnapshotPayload = {
  recommendedAction: "followup",
  rationale: "A follow-up plan is available.",
  steps: [],
  shouldSendMessage: true,
  shouldScheduleVisit: false,
  shouldCall: false,
  shouldWait: false,
};

const CALL_HISTORY_MISSING_OUTCOME: CallHistoryRecord[] = [
  {
    id: "call-1",
    job_id: JOB_RECORD.id,
    workspace_id: "workspace-1",
    outcome: null,
    status: null,
    started_at: "2023-01-03T00:00:00Z",
    created_at: "2023-01-03T00:00:00Z",
    duration_seconds: 180,
    direction: "outbound",
  },
];

type PipelineScenario = {
  label: string;
  snapshots: {
    diagnoseSnapshot: AskBobDiagnoseSnapshotPayload | null;
    materialsSnapshot: AskBobMaterialsSnapshotPayload | null;
    quoteSnapshot: AskBobQuoteSnapshotPayload | null;
    followupSnapshot: AskBobFollowupSnapshotPayload | null;
  };
  quotes: Array<{
    id: string;
    job_id: string;
    status: string;
    total: number;
    created_at: string;
    smart_quote_used: boolean | null;
  }>;
  callHistory: CallHistoryRecord[];
  latestCallOutcome: string | null;
};

const pipelineScenarios: PipelineScenario[] = [
  {
    label: "Diagnose missing",
    snapshots: {
      diagnoseSnapshot: null,
      materialsSnapshot: null,
      quoteSnapshot: null,
      followupSnapshot: null,
    },
    quotes: [],
    callHistory: [],
    latestCallOutcome: null,
  },
  {
    label: "Diagnose present only",
    snapshots: {
      diagnoseSnapshot: DIAGNOSE_SNAPSHOT,
      materialsSnapshot: null,
      quoteSnapshot: null,
      followupSnapshot: null,
    },
    quotes: [],
    callHistory: [],
    latestCallOutcome: null,
  },
  {
    label: "Diagnose + materials",
    snapshots: {
      diagnoseSnapshot: DIAGNOSE_SNAPSHOT,
      materialsSnapshot: MATERIALS_SNAPSHOT,
      quoteSnapshot: null,
      followupSnapshot: null,
    },
    quotes: [],
    callHistory: [],
    latestCallOutcome: null,
  },
  {
    label: "Diagnose + materials + quote",
    snapshots: {
      diagnoseSnapshot: DIAGNOSE_SNAPSHOT,
      materialsSnapshot: MATERIALS_SNAPSHOT,
      quoteSnapshot: QUOTE_SNAPSHOT,
      followupSnapshot: null,
    },
    quotes: [
      {
        id: "quote-draft",
        job_id: JOB_RECORD.id,
        status: "draft",
        total: 150,
        created_at: "2023-01-02T00:00:00Z",
        smart_quote_used: false,
      },
    ],
    callHistory: [],
    latestCallOutcome: null,
  },
  {
    label: "Follow-up present (draft ready)",
    snapshots: {
      diagnoseSnapshot: DIAGNOSE_SNAPSHOT,
      materialsSnapshot: MATERIALS_SNAPSHOT,
      quoteSnapshot: QUOTE_SNAPSHOT,
      followupSnapshot: FOLLOWUP_SNAPSHOT,
    },
    quotes: [
      {
        id: "quote-accepted",
        job_id: JOB_RECORD.id,
        status: "accepted",
        total: 200,
        created_at: "2023-01-03T00:00:00Z",
        smart_quote_used: false,
      },
    ],
    callHistory: [],
    latestCallOutcome: null,
  },
  {
    label: "Call session pending outcome",
    snapshots: {
      diagnoseSnapshot: DIAGNOSE_SNAPSHOT,
      materialsSnapshot: MATERIALS_SNAPSHOT,
      quoteSnapshot: QUOTE_SNAPSHOT,
      followupSnapshot: null,
    },
    quotes: [
      {
        id: "quote-accepted",
        job_id: JOB_RECORD.id,
        status: "accepted",
        total: 250,
        created_at: "2023-01-04T00:00:00Z",
        smart_quote_used: false,
      },
    ],
    callHistory: CALL_HISTORY_MISSING_OUTCOME,
    latestCallOutcome: null,
  },
];

const baseWorkspaceContext = {
  ok: true,
  workspaceId: "workspace-1",
  userId: "user-1",
  membership: {
    user: { id: "user-1" },
    workspace: { id: "workspace-1" },
    role: "owner",
  },
};

function setupScenario(scenario: PipelineScenario) {
  const state = createSupabaseState({
    jobs: { data: [JOB_RECORD], error: null },
    appointments: { data: [], error: null },
    quotes: { data: scenario.quotes, error: null },
    invoices: { data: [], error: null },
  });
  state.supabase.auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
  };
  mockResolveWorkspaceContext.mockReset();
  mockGetJobAskBobHudSummary.mockReset();
  mockGetJobAskBobSnapshotsForJob.mockReset();
  mockGetJobAskBobSnapshotHistoryForJob.mockReset();
  mockLoadCallHistoryForJob.mockReset();
  mockGetLatestCallOutcomeForJob.mockReset();
  mockResolveWorkspaceContext.mockResolvedValue(baseWorkspaceContext);
  mockGetJobAskBobHudSummary.mockResolvedValue(BASE_HUD_SUMMARY);
  mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
    ...scenario.snapshots,
    afterCallSnapshot: null,
    postCallEnrichmentSnapshot: null,
  });
  mockGetJobAskBobSnapshotHistoryForJob.mockResolvedValue({
    diagnose: [],
    materials: [],
    quote: [],
  });
  mockLoadCallHistoryForJob.mockResolvedValue(scenario.callHistory);
  mockGetLatestCallOutcomeForJob.mockResolvedValue(scenario.latestCallOutcome);
  return state;
}

function buildExpectedForScenario(scenario: PipelineScenario) {
  const latestQuote = scenario.quotes[0] ?? null;
  const callSummarySignals = computeCallSummarySignals(scenario.callHistory);
  const hasCallSummary = Boolean(scenario.callHistory.length > 0 || scenario.latestCallOutcome);
  const hasCallWithMissingOutcome = scenario.callHistory.some(
    (record) => !(record.outcome ?? record.status ?? "").trim(),
  );
  const nextStep = deriveNextStepForJobDetails({
    hasDiagnoseSnapshot: Boolean(scenario.snapshots.diagnoseSnapshot),
    hasMaterialsSnapshot: Boolean(scenario.snapshots.materialsSnapshot),
    latestQuoteId: latestQuote?.id ?? null,
    latestQuoteStatus: latestQuote?.status ?? null,
    followupSnapshot: scenario.snapshots.followupSnapshot,
    callRecommended: false,
    hasCallWithMissingOutcome,
    latestCallOutcomeRecorded: Boolean(scenario.latestCallOutcome),
    invoiceStatus: null,
    invoicePresent: false,
  });
  const derivedCopy = deriveJobDetailsAskBobDerivedCopy({
    nextStep,
    hudSummary: BASE_HUD_SUMMARY,
    hasDiagnoseSnapshot: Boolean(scenario.snapshots.diagnoseSnapshot),
    hasMaterialsSnapshot: Boolean(scenario.snapshots.materialsSnapshot),
    hasQuoteSnapshot: Boolean(scenario.snapshots.quoteSnapshot),
    hasFollowupSnapshot: Boolean(scenario.snapshots.followupSnapshot),
    hasCallSummary,
    callSummarySignals,
  });
  return { nextStep, derivedCopy };
}

function extractTextByTestId(markup: string, testId: string) {
  const match = markup.match(new RegExp(`data-testid="${testId}"[^>]*>([\\s\\S]*?)<`, "m"));
  return match?.[1].trim() ?? "";
}

describe("JobDetails pipeline-state regression", () => {
  it("keeps the single CTA, derived summary, and telemetry stable across states", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      for (const scenario of pipelineScenarios) {
        setupScenario(scenario);
        const expected = buildExpectedForScenario(scenario);
        const logIndexBeforeRender = logSpy.mock.calls.length;
        const markup = await renderJobDetailPage();
        const scenarioLogs = logSpy.mock.calls.slice(logIndexBeforeRender);
        const nextStepEvent = scenarioLogs.find(([name]) => name === "[job-details-next-step-rendered]");
        expect(nextStepEvent).toBeDefined();
        expect(nextStepEvent?.[1].stepType).toBe(expected.nextStep.stepType);

        const progressHeaderIndex = markup.indexOf('data-testid="job-details-job-progress-header"');
        expect(progressHeaderIndex).toBeGreaterThan(-1);

        const topSection = markup.slice(0, progressHeaderIndex);
        const primaryCtaMatches = topSection.match(/data-testid="[^"]*primary-cta"/g) ?? [];
        expect(primaryCtaMatches).toHaveLength(1);
        expect(primaryCtaMatches[0]).toContain("job-details-next-step-primary-cta");

        expect(markup).toContain('data-testid="job-details-askbob-summary-collapsed"');
        expect(markup).not.toContain('data-testid="job-details-askbob-summary-expanded"');

        const collapsedText = extractTextByTestId(markup, "job-details-askbob-summary-collapsed");
        expect(collapsedText).toBe(expected.derivedCopy.askBobSummary.collapsedLine);

        const rationaleText = extractTextByTestId(markup, "job-details-next-step-rationale");
        expect(rationaleText).toBe(expected.nextStep.rationale);
      }

      const telemetryScenario = pipelineScenarios[4];
      const telemetryExpected = buildExpectedForScenario(telemetryScenario);
      setupScenario(telemetryScenario);
      const element = await JobDetailPage({
        params: Promise.resolve({ id: JOB_RECORD.id }),
        searchParams: Promise.resolve({}),
      });
      const container = document.createElement("div");
      const root = createRoot(container);
      const toggleLogIndex = logSpy.mock.calls.length;
      try {
        act(() => {
          root.render(element);
        });
        const toggleButton = container.querySelector('[data-testid="job-details-askbob-summary-toggle"]');
        act(() => {
          toggleButton?.click();
        });
        const toggleLogs = logSpy.mock.calls.slice(toggleLogIndex);
        const expandedEvent = toggleLogs.find(
          ([name]) => name === "[job-details-askbob-summary-expanded]",
        );
        expect(expandedEvent).toBeDefined();
        expect(expandedEvent?.[1].stepType).toBe(telemetryExpected.nextStep.stepType);
      } finally {
        act(() => {
          root.unmount();
        });
      }
    } finally {
      logSpy.mockRestore();
    }
  });
});
