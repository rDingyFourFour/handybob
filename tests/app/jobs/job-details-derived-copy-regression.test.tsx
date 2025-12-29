import { describe, expect, it, beforeEach, vi } from "vitest";

import type { AskBobDiagnoseSnapshotPayload } from "@/lib/domain/askbob/types";
import { PROGRESS_STEPS } from "@/app/(app)/jobs/[id]/progressSteps";
import { computeCallSummarySignals } from "@/lib/domain/askbob/callHistory";
import { deriveNextStepForJobDetails } from "@/lib/domain/askbob/nextStep";
import {
  buildJobProgressRowCopyMap,
  deriveJobDetailsAskBobDerivedCopy,
} from "@/lib/domain/askbob/jobDetailsDerivedCopy";
import { containsForbiddenBobLanguage } from "@/lib/domain/copy/bobVoice";
import {
  renderJobDetailPage,
  createSupabaseState,
  JOB_RECORD,
  mockGetJobAskBobHudSummary,
  mockGetJobAskBobSnapshotsForJob,
  mockGetJobAskBobSnapshotHistoryForJob,
  mockGetLatestCallOutcomeForJob,
  mockLoadCallHistoryForJob,
  mockResolveWorkspaceContext,
} from "../job-details/test-helpers";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";

const diagnoseSnapshotStub: AskBobDiagnoseSnapshotPayload = {
  sessionId: "snapshot-1",
  responseId: "response-1",
  createdAt: "2023-01-01T00:00:00Z",
  sections: [
    {
      type: "steps",
      title: "Summary",
      items: ["Review test artifacts"],
    },
  ],
};

const HUD_SUMMARY = {
  lastTaskLabel: "Diagnose",
  lastUsedAt: "2023-01-01T00:00:00Z",
  totalRunsCount: 2,
  tasksSeen: ["Diagnose"],
};

const CALL_TIMESTAMP = new Date().toISOString();
const CALL_HISTORY = [
  {
    id: "call-1",
    job_id: JOB_RECORD.id,
    workspace_id: "workspace-1",
    outcome: "answered",
    status: "completed",
    created_at: CALL_TIMESTAMP,
    started_at: CALL_TIMESTAMP,
    duration_seconds: 60,
    direction: "outbound",
  },
];

describe("job details derived copy regression", () => {
  beforeEach(() => {
    const supabase = createSupabaseState({
      jobs: { data: [JOB_RECORD], error: null },
      appointments: { data: [], error: null },
      quotes: { data: [], error: null },
    });
    supabase.supabase.auth = {
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
    mockGetJobAskBobHudSummary.mockResolvedValue(HUD_SUMMARY);
    mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
      diagnoseSnapshot: diagnoseSnapshotStub,
      materialsSnapshot: { items: [] },
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
    mockLoadCallHistoryForJob.mockResolvedValue(CALL_HISTORY);
    mockGetLatestCallOutcomeForJob.mockResolvedValue(null);
  });

  it("renders derived summary copy, status hints, and a single primary CTA", async () => {
    const nextStep = deriveNextStepForJobDetails({
      hasDiagnoseSnapshot: true,
      hasMaterialsSnapshot: true,
      latestQuoteId: null,
      latestQuoteStatus: null,
      followupSnapshot: null,
      callRecommended: false,
      hasCallWithMissingOutcome: false,
      latestCallOutcomeRecorded: false,
      invoiceStatus: null,
      invoicePresent: false,
    });
    const callSummarySignals = computeCallSummarySignals(CALL_HISTORY);
    const derivedCopy = deriveJobDetailsAskBobDerivedCopy({
      nextStep,
      hudSummary: HUD_SUMMARY,
      hasDiagnoseSnapshot: true,
      hasMaterialsSnapshot: true,
      hasQuoteSnapshot: false,
      hasFollowupSnapshot: false,
      hasCallSummary: CALL_HISTORY.length > 0,
      callSummarySignals,
    });
    const progressRowCopy = buildJobProgressRowCopyMap({
      statuses: derivedCopy.progressRowStatuses,
      callHistoryHint: derivedCopy.callHistoryHint,
    });

    const markup = await renderJobDetailPage();
    expect(markup).toContain("AskBob has generated Diagnosis, Materials, and Call summary.");
    expect(markup).toContain(jobDetailsCopy.progressStatus.diagnose.done);
    expect(markup).toContain("1 attempt");
    const primaryCtas = markup.match(/data-testid="job-details-next-step-primary-cta"/g) ?? [];
    expect(primaryCtas).toHaveLength(1);

    const container = document.createElement("div");
    container.innerHTML = markup;
    const progressSection = container.querySelector('[data-testid="job-details-job-progress"]');
    expect(progressSection).toBeTruthy();
    const forbidden = containsForbiddenBobLanguage(progressSection?.textContent ?? "");
    expect(forbidden.ok).toBe(true);

    for (const step of PROGRESS_STEPS) {
      const statusElement = container.querySelector(
        `[data-testid="progress-row-${step.key}-status"]`,
      );
      expect(statusElement?.textContent?.trim()).toBe(progressRowCopy[step.key].statusText);
      const hintElement = container.querySelector(`[data-testid="progress-row-${step.key}-hint"]`);
      const expectedHint = progressRowCopy[step.key].hintText;
      if (expectedHint) {
        expect(hintElement?.textContent?.trim()).toBe(expectedHint);
      } else {
        expect(hintElement).toBeNull();
      }
    }
  });
});
