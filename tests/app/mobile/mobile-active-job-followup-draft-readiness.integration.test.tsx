import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { getBobInstructionSentence } from "@/lib/domain/askbob/bobInstructionSentenceCopy";
import type {
  AskBobAfterCallSnapshotPayload,
  AskBobDiagnoseSnapshotPayload,
  AskBobFollowupSnapshotPayload,
  AskBobMaterialsSnapshotPayload,
} from "@/lib/domain/askbob/types";
import {
  createSupabaseState,
  mockGetCurrentWorkspace,
  mockGetJobAskBobSnapshotsForJob,
  mockGetLatestCallOutcomeForJob,
  mockGetInvoiceForJob,
  mockLoadCallHistoryForJob,
} from "@/tests/app/mobile/test-helpers";
import MobileActiveJobPage from "@/app/m/jobs/[id]/page";

const JOB_RECORD = {
  id: "00000000-0000-4000-8000-00000000000b",
  title: "Active follow-up job",
  status: "open",
  customer_id: "customer-1",
  customers: { id: "customer-1", name: "Acme Factory" },
};

const QUOTE_RECORD = {
  id: "quote-active-followup",
  status: "accepted",
};

const DIAGNOSE_SNAPSHOT: AskBobDiagnoseSnapshotPayload = {
  sessionId: "mobile-snapshot-diagnose",
  responseId: "mobile-response-diagnose",
  createdAt: "2023-01-01T00:00:00Z",
  sections: [
    {
      type: "steps",
      title: "Steps",
      items: ["Review follow-up context"],
    },
  ],
};

const MATERIALS_SNAPSHOT: AskBobMaterialsSnapshotPayload = {
  items: [],
};

const FOLLOWUP_SNAPSHOT: AskBobFollowupSnapshotPayload = {
  recommendedAction: "Follow up",
  rationale: "Follow-up story",
  steps: [{ label: "Send message" }],
  shouldSendMessage: true,
  shouldScheduleVisit: false,
  shouldCall: false,
  shouldWait: false,
  callRecommended: true,
  modelLatencyMs: 1,
};

const AFTER_CALL_SNAPSHOT_WITH_DRAFT: AskBobAfterCallSnapshotPayload = {
  afterCallSummary: "After call summary",
  recommendedActionLabel: "Share draft",
  recommendedActionSteps: [],
  suggestedChannel: "sms",
  draftMessageBody: "Here is a follow-up draft",
  urgencyLevel: "normal",
};

describe("Mobile Active Job follow-up readiness", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockGetCurrentWorkspace.mockReset();
    mockGetCurrentWorkspace.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      workspace: { id: "workspace-1", name: "Test", owner_id: "owner-1" },
      role: "owner",
    });
    mockGetInvoiceForJob.mockReset();
    mockLoadCallHistoryForJob.mockReset();
    mockGetLatestCallOutcomeForJob.mockReset();
    mockGetJobAskBobSnapshotsForJob.mockReset();
    mockLoadCallHistoryForJob.mockResolvedValue([]);
    mockGetLatestCallOutcomeForJob.mockResolvedValue(null);
    mockGetInvoiceForJob.mockResolvedValue({ invoice: null, error: null });
    const supabaseState = createSupabaseState({
      jobs: {
        data: [JOB_RECORD],
        error: null,
      },
      quotes: {
        data: [{ ...QUOTE_RECORD, job_id: JOB_RECORD.id, created_at: new Date().toISOString() }],
        error: null,
      },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1", email: "owner@example.com", user_metadata: {} } },
      }),
    };
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
  });

  async function renderStatement(afterCallSnapshot: AskBobAfterCallSnapshotPayload | null) {
    mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
      diagnoseSnapshot: DIAGNOSE_SNAPSHOT,
      materialsSnapshot: MATERIALS_SNAPSHOT,
      quoteSnapshot: null,
      followupSnapshot: FOLLOWUP_SNAPSHOT,
      afterCallSnapshot,
      postCallEnrichmentSnapshot: null,
    });

    const element = await MobileActiveJobPage({ params: { id: JOB_RECORD.id } });
    act(() => {
      root?.render(element);
    });

    const card = container.querySelector('[data-testid="mobile-active-job-next-step-card"]');
    expect(card).toBeTruthy();
    const recommendation = card?.querySelector("p.text-lg");
    expect(recommendation).toBeTruthy();
    const statementElement = recommendation?.previousElementSibling;
    return statementElement?.textContent?.trim();
  }

  it("shows the follow-up due statement when no draft exists", async () => {
    // followUpDraftReady for this surface is driven by afterCallSnapshot.draftMessageBody.
    const statement = await renderStatement(null);
    expect(statement).toBe(getBobInstructionSentence("followup_due"));
  });

  it("shows the draft-ready statement when a draft exists", async () => {
    const statement = await renderStatement(AFTER_CALL_SNAPSHOT_WITH_DRAFT);
    expect(statement).toBe(getBobInstructionSentence("followup_draft_ready"));
  });
});
