import { describe, expect, it, beforeEach, vi } from "vitest";

import { getBobInstructionSentence } from "@/lib/domain/askbob/bobInstructionSentenceCopy";
import type {
  AskBobAfterCallSnapshotPayload,
  AskBobDiagnoseSnapshotPayload,
  AskBobFollowupSnapshotPayload,
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
} from "../job-details/test-helpers";

const FOLLOWUP_DUE_SENTENCE = getBobInstructionSentence("followup_due");
const FOLLOWUP_DRAFT_READY_SENTENCE = getBobInstructionSentence("followup_draft_ready");

const QUOTE_RECORD = {
  id: "quote-followup-ready",
  job_id: JOB_RECORD.id,
  status: "accepted",
  created_at: new Date().toISOString(),
};

const DIAGNOSE_SNAPSHOT: AskBobDiagnoseSnapshotPayload = {
  sessionId: "snapshot-diagnose",
  responseId: "response-diagnose",
  createdAt: "2023-01-01T01:00:00Z",
  sections: [
    {
      type: "steps",
      title: "Summary",
      items: ["Inspect job context"],
    },
  ],
};

const MATERIALS_SNAPSHOT: AskBobMaterialsSnapshotPayload = {
  items: [],
};

const FOLLOWUP_SNAPSHOT: AskBobFollowupSnapshotPayload = {
  recommendedAction: "Check in with the customer",
  rationale: "There’s a follow-up ready to go.",
  steps: [{ label: "Send message" }],
  shouldSendMessage: true,
  shouldScheduleVisit: false,
  shouldCall: false,
  shouldWait: false,
  callRecommended: true,
  modelLatencyMs: 1,
};

const AFTER_CALL_SNAPSHOT_WITH_DRAFT: AskBobAfterCallSnapshotPayload = {
  afterCallSummary: "After call recap",
  recommendedActionLabel: "Follow up after call",
  recommendedActionSteps: [],
  suggestedChannel: "sms",
  draftMessageBody: "Draft ready",
  urgencyLevel: "normal",
};

const HUD_SUMMARY = {
  lastTaskLabel: "Follow up",
  lastUsedAt: "2023-01-01T00:00:00Z",
  totalRunsCount: 1,
  tasksSeen: ["Follow up"],
};

describe("Job Details follow-up draft readiness", () => {
  beforeEach(() => {
    const supabaseState = createSupabaseState({
      jobs: { data: [JOB_RECORD], error: null },
      appointments: { data: [], error: null },
      quotes: { data: [QUOTE_RECORD], error: null },
      invoices: { data: [], error: null },
    });
    supabaseState.supabase.auth = {
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
    mockGetJobAskBobSnapshotHistoryForJob.mockResolvedValue({
      diagnose: [],
      materials: [],
      quote: [],
    });
    mockLoadCallHistoryForJob.mockResolvedValue([]);
    mockGetLatestCallOutcomeForJob.mockResolvedValue(null);
  });

  it("flips the Bob instruction statement when the follow-up draft signal changes", async () => {
    const scenarios = [
      {
        name: "follow-up due",
        afterCallSnapshot: null,
        expected: FOLLOWUP_DUE_SENTENCE,
      },
      {
        name: "follow-up draft ready",
        afterCallSnapshot: AFTER_CALL_SNAPSHOT_WITH_DRAFT,
        expected: FOLLOWUP_DRAFT_READY_SENTENCE,
      },
    ];

    // followUpDraftReady is derived from afterCallSnapshot.draftMessageBody.
    for (const scenario of scenarios) {
      mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
        diagnoseSnapshot: DIAGNOSE_SNAPSHOT,
        materialsSnapshot: MATERIALS_SNAPSHOT,
        quoteSnapshot: null,
        followupSnapshot: FOLLOWUP_SNAPSHOT,
        afterCallSnapshot: scenario.afterCallSnapshot,
        postCallEnrichmentSnapshot: null,
      });

      const markup = await renderJobDetailPage();
      const container = document.createElement("div");
      container.innerHTML = markup;
      const card = container.querySelector('[data-instruction-step-type="followup"]');
      expect(card).toBeTruthy();
      const statementElement = card?.querySelector(".space-y-2 > p.text-sm");
      const statementText = statementElement?.textContent?.trim();
      expect(statementText).toBe(
        scenario.expected,
      );
    }
  });
});
