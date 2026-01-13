import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import {
  createSupabaseState,
  mockGetCurrentWorkspace,
  mockGetJobAskBobSnapshotsForJob,
  mockDraftAskBobJobFollowupMessageAction,
} from "@/tests/app/mobile/test-helpers";
import MobileFollowUpDraftPage from "@/app/m/follow-up/page";
import type {
  AskBobAfterCallSnapshotPayload,
  AskBobFollowupSnapshotPayload,
} from "@/lib/domain/askbob/types";
import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";

const WORKSPACE = {
  id: "workspace-followup",
  name: "Follow-up workspace",
  owner_id: "owner-1",
};

const JOB_RECORD = {
  id: "01234567-89ab-cdef-0123-456789abcdef",
  title: "Follow-up job",
  workspace_id: WORKSPACE.id,
  customer_id: "customer-1",
};

const FOLLOWUP_SNAPSHOT: AskBobFollowupSnapshotPayload = {
  recommendedAction: "Then text the customer",
  rationale: "They asked for a follow-up message.",
  steps: [{ label: "Check that the quote is accepted" }],
  shouldSendMessage: true,
  shouldScheduleVisit: false,
  shouldCall: false,
  shouldWait: false,
  modelLatencyMs: 1,
};

const AFTER_CALL_SNAPSHOT: AskBobAfterCallSnapshotPayload = {
  afterCallSummary: "Follow-up summary",
  recommendedActionLabel: "Follow-up message",
  recommendedActionSteps: ["Send a friendly reminder"],
  suggestedChannel: "sms",
  draftMessageBody: "Here is the draft message.",
  urgencyLevel: "normal",
};

type SearchParams = {
  jobId: string;
  workspaceId: string;
  retry?: string;
  debug?: string;
};

const SEARCH_PARAMS: SearchParams = {
  jobId: JOB_RECORD.id,
  workspaceId: WORKSPACE.id,
};

describe("Mobile follow-up draft page", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockGetCurrentWorkspace.mockReset();
    mockGetCurrentWorkspace.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      workspace: WORKSPACE,
      role: "owner",
    });
    mockGetJobAskBobSnapshotsForJob.mockReset();
    mockDraftAskBobJobFollowupMessageAction.mockReset();
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
  });

  function setupSupabaseState() {
    const supabaseState = createSupabaseState({
      jobs: { data: [JOB_RECORD], error: null },
      askbob_job_task_snapshots: { data: [], error: null },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1", email: "owner@example.com", user_metadata: {} } },
      }),
    };
    return supabaseState;
  }

  async function renderPage(params: SearchParams = SEARCH_PARAMS) {
    const element = await MobileFollowUpDraftPage({
      searchParams: Promise.resolve(params),
    });
    act(() => {
      root?.render(element);
    });
  }

  function expectSingleCard({ draftExpected }: { draftExpected: boolean }) {
    const hasDraftCard = Boolean(container.querySelector('[data-testid="mobile-followup-draft-card"]'));
    const hasPlaceholderCard = Boolean(container.querySelector('[data-testid="mobile-followup-placeholder-card"]'));
    expect(hasDraftCard).toBe(draftExpected);
    expect(hasPlaceholderCard).toBe(!draftExpected);
  }

  it("renders an existing draft immediately", async () => {
    setupSupabaseState();
    mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
      diagnoseSnapshot: null,
      materialsSnapshot: null,
      quoteSnapshot: null,
      followupSnapshot: FOLLOWUP_SNAPSHOT,
      afterCallSnapshot: AFTER_CALL_SNAPSHOT,
      postCallEnrichmentSnapshot: null,
    });

    await renderPage();

    const message = container.querySelector('[data-testid="mobile-followup-draft-message"]');
    expect(message?.textContent).toContain("Here is the draft message.");
    expect(mockDraftAskBobJobFollowupMessageAction).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="mobile-followup-draft-card"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="mobile-followup-placeholder-card"]')).toBeNull();
    expectSingleCard({ draftExpected: true });
  });

  it("renders the draft card when after-call snapshot uses a legacy result shape", async () => {
    setupSupabaseState();
    const legacyAfterCallSnapshot = {
      afterCallSummary: "Legacy summary",
      recommendedActionLabel: "Legacy action",
      recommendedActionSteps: [],
      suggestedChannel: "none",
      draftMessageBody: null,
      urgencyLevel: "normal",
      notesForTech: null,
      modelLatencyMs: 1,
      result: {
        draftMessageBody: "Legacy result draft text.",
      },
    } as AskBobAfterCallSnapshotPayload & { result: { draftMessageBody: string } };
    mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
      diagnoseSnapshot: null,
      materialsSnapshot: null,
      quoteSnapshot: null,
      followupSnapshot: FOLLOWUP_SNAPSHOT,
      afterCallSnapshot: legacyAfterCallSnapshot,
      postCallEnrichmentSnapshot: null,
    });

    await renderPage();

    const message = container.querySelector('[data-testid="mobile-followup-draft-message"]');
    expect(message?.textContent).toContain("Legacy result draft text.");
    expect(container.querySelector('[data-testid="mobile-followup-draft-card"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="mobile-followup-placeholder-card"]')).toBeNull();
    expect(mockDraftAskBobJobFollowupMessageAction).not.toHaveBeenCalled();
    expectSingleCard({ draftExpected: true });
  });

  it("generates a draft when none exists yet", async () => {
    setupSupabaseState();
    mockGetJobAskBobSnapshotsForJob
      .mockResolvedValueOnce({
        diagnoseSnapshot: null,
        materialsSnapshot: null,
        quoteSnapshot: null,
        followupSnapshot: FOLLOWUP_SNAPSHOT,
        afterCallSnapshot: null,
        postCallEnrichmentSnapshot: null,
      })
      .mockResolvedValueOnce({
        diagnoseSnapshot: null,
        materialsSnapshot: null,
        quoteSnapshot: null,
        followupSnapshot: FOLLOWUP_SNAPSHOT,
        afterCallSnapshot: AFTER_CALL_SNAPSHOT,
        postCallEnrichmentSnapshot: null,
      });
    mockDraftAskBobJobFollowupMessageAction.mockResolvedValue({
      ok: true,
      jobId: JOB_RECORD.id,
      customerId: JOB_RECORD.customer_id,
      body: "Generated draft message",
      meta: {
        suggestedChannel: "sms",
        summary: "Draft summary",
        modelLatencyMs: 2,
        followupDueStatus: "due",
        followupDueLabel: "Due soon",
        hasOpenQuote: false,
        hasUnpaidInvoice: false,
        hasScheduledVisit: false,
      },
    });

    await renderPage();

    const message = container.querySelector('[data-testid="mobile-followup-draft-message"]');
    expect(message?.textContent).toContain("Here is the draft message.");
    expect(mockDraftAskBobJobFollowupMessageAction).toHaveBeenCalledTimes(1);
    expectSingleCard({ draftExpected: true });
  });

  it("does not rerun the runner when a draft snapshot already exists", async () => {
    setupSupabaseState();
    mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
      diagnoseSnapshot: null,
      materialsSnapshot: null,
      quoteSnapshot: null,
      followupSnapshot: FOLLOWUP_SNAPSHOT,
      afterCallSnapshot: AFTER_CALL_SNAPSHOT,
      postCallEnrichmentSnapshot: null,
    });

    await renderPage();
    await renderPage();

    expect(mockDraftAskBobJobFollowupMessageAction).not.toHaveBeenCalled();
    expectSingleCard({ draftExpected: true });
  });

  it("renders placeholder + retry affordance when followup snapshot says shouldSendMessage but draft action fails", async () => {
    setupSupabaseState();
    mockGetJobAskBobSnapshotsForJob
      .mockResolvedValueOnce({
        diagnoseSnapshot: null,
        materialsSnapshot: null,
        quoteSnapshot: null,
        followupSnapshot: FOLLOWUP_SNAPSHOT,
        afterCallSnapshot: null,
        postCallEnrichmentSnapshot: null,
      })
      .mockResolvedValueOnce({
        diagnoseSnapshot: null,
        materialsSnapshot: null,
        quoteSnapshot: null,
        followupSnapshot: FOLLOWUP_SNAPSHOT,
        afterCallSnapshot: null,
        postCallEnrichmentSnapshot: null,
      });
    mockDraftAskBobJobFollowupMessageAction.mockResolvedValue({
      ok: false,
      jobId: JOB_RECORD.id,
      customerId: JOB_RECORD.customer_id,
      body: null,
      code: "MODEL_ERROR",
      meta: {
        suggestedChannel: "sms",
        summary: "Draft summary",
        modelLatencyMs: 2,
        followupDueStatus: "due",
        followupDueLabel: "Due soon",
        hasOpenQuote: false,
        hasUnpaidInvoice: false,
        hasScheduledVisit: false,
      },
    });

    await renderPage();

    const placeholder = container.querySelector('[data-testid="mobile-followup-placeholder-card"]');
    expect(placeholder).toBeTruthy();
    expect(container.textContent).toContain(mobileFlowCopy.followupPlaceholder.retryDescription);
    const retryButton = container.querySelector('[data-testid="mobile-followup-placeholder-retry-button"]');
    expect(retryButton).toBeTruthy();
    expect(retryButton?.getAttribute("href")).toBe(
      `/m/follow-up?jobId=${JOB_RECORD.id}&workspaceId=${WORKSPACE.id}&retry=1`,
    );
    expect(mockDraftAskBobJobFollowupMessageAction).toHaveBeenCalledTimes(1);
    expectSingleCard({ draftExpected: false });
  });

  it("never renders placeholder when a draft is present on first load", async () => {
    setupSupabaseState();
    mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
      diagnoseSnapshot: null,
      materialsSnapshot: null,
      quoteSnapshot: null,
      followupSnapshot: FOLLOWUP_SNAPSHOT,
      afterCallSnapshot: AFTER_CALL_SNAPSHOT,
      postCallEnrichmentSnapshot: null,
    });
    container.innerHTML = '<div data-testid="mobile-followup-placeholder-card"></div>';

    await renderPage();

    expectSingleCard({ draftExpected: true });
  });

  it("does not attempt generation when followup snapshot is missing", async () => {
    setupSupabaseState();
    mockGetJobAskBobSnapshotsForJob.mockResolvedValue({
      diagnoseSnapshot: null,
      materialsSnapshot: null,
      quoteSnapshot: null,
      followupSnapshot: null,
      afterCallSnapshot: null,
      postCallEnrichmentSnapshot: null,
    });

    await renderPage();

    expect(mockDraftAskBobJobFollowupMessageAction).not.toHaveBeenCalled();
    expectSingleCard({ draftExpected: false });
  });

  it("retry=1 forces a new generation attempt even if a previous attempt occurred", async () => {
    setupSupabaseState();
    mockGetJobAskBobSnapshotsForJob
      .mockResolvedValueOnce({
        diagnoseSnapshot: null,
        materialsSnapshot: null,
        quoteSnapshot: null,
        followupSnapshot: FOLLOWUP_SNAPSHOT,
        afterCallSnapshot: null,
        postCallEnrichmentSnapshot: null,
      })
      .mockResolvedValueOnce({
        diagnoseSnapshot: null,
        materialsSnapshot: null,
        quoteSnapshot: null,
        followupSnapshot: FOLLOWUP_SNAPSHOT,
        afterCallSnapshot: null,
        postCallEnrichmentSnapshot: null,
      })
      .mockResolvedValueOnce({
        diagnoseSnapshot: null,
        materialsSnapshot: null,
        quoteSnapshot: null,
        followupSnapshot: FOLLOWUP_SNAPSHOT,
        afterCallSnapshot: null,
        postCallEnrichmentSnapshot: null,
      })
      .mockResolvedValueOnce({
        diagnoseSnapshot: null,
        materialsSnapshot: null,
        quoteSnapshot: null,
        followupSnapshot: FOLLOWUP_SNAPSHOT,
        afterCallSnapshot: null,
        postCallEnrichmentSnapshot: null,
      });
    mockDraftAskBobJobFollowupMessageAction
      .mockResolvedValueOnce({
        ok: false,
        jobId: JOB_RECORD.id,
        customerId: JOB_RECORD.customer_id,
        body: null,
        code: "MODEL_ERROR",
        meta: {
          suggestedChannel: "sms",
          summary: "Draft summary",
          modelLatencyMs: 2,
          followupDueStatus: "due",
          followupDueLabel: "Due soon",
          hasOpenQuote: false,
          hasUnpaidInvoice: false,
          hasScheduledVisit: false,
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        jobId: JOB_RECORD.id,
        customerId: JOB_RECORD.customer_id,
        body: null,
        code: "MODEL_ERROR",
        meta: {
          suggestedChannel: "sms",
          summary: "Draft summary",
          modelLatencyMs: 2,
          followupDueStatus: "due",
          followupDueLabel: "Due soon",
          hasOpenQuote: false,
          hasUnpaidInvoice: false,
          hasScheduledVisit: false,
        },
      });

    await renderPage();
    await renderPage({ ...SEARCH_PARAMS, retry: "1" });

    expect(mockDraftAskBobJobFollowupMessageAction).toHaveBeenCalledTimes(2);
    expectSingleCard({ draftExpected: false });
  });
});
