import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import type {
  AskBobAfterCallSnapshotPayload,
  AskBobDiagnoseSnapshotPayload,
  AskBobFollowupSnapshotPayload,
  AskBobMaterialsSnapshotPayload,
} from "@/lib/domain/askbob/types";
import { createSupabaseState, mockGetCurrentWorkspace } from "@/tests/app/mobile/test-helpers";
import MobileHomePage from "@/app/m/page";

const JOB_RECORD = {
  id: "job-home-followup-1",
  title: "Home follow-up job",
  status: "open",
  created_at: "2023-01-01T00:00:00Z",
  updated_at: "2023-01-01T00:00:00Z",
  customer: { name: "Follow-up customer" },
};

const QUOTE_RECORD = {
  id: "quote-home-followup",
  job_id: JOB_RECORD.id,
  status: "accepted",
  created_at: "2023-01-01T00:00:00Z",
};

const DIAGNOSE_SNAPSHOT: AskBobDiagnoseSnapshotPayload = {
  sessionId: "home-diagnose",
  responseId: "home-response",
  createdAt: "2023-01-01T00:00:00Z",
  sections: [
    {
      type: "steps",
      title: "Steps",
      items: ["Home follow-up context"],
    },
  ],
};

const MATERIALS_SNAPSHOT: AskBobMaterialsSnapshotPayload = {
  items: [{ name: "Pipe", quantity: "1", notes: "none" }],
};
const QUOTE_SNAPSHOT = {
  lines: [
    {
      description: "Labor",
      quantity: 1,
    },
  ],
};

const FOLLOWUP_SNAPSHOT: AskBobFollowupSnapshotPayload = {
  recommendedAction: "Home follow-up",
  rationale: "Home rationale",
  steps: [{ label: "Send message" }],
  shouldSendMessage: false,
  shouldScheduleVisit: false,
  shouldCall: false,
  shouldWait: false,
  callRecommended: true,
  modelLatencyMs: 1,
};

const AFTER_CALL_SNAPSHOT_WITH_DRAFT: AskBobAfterCallSnapshotPayload = {
  afterCallSummary: "Home after call summary",
  recommendedActionLabel: "Home follow-up draft",
  recommendedActionSteps: [],
  suggestedChannel: "sms",
  draftMessageBody: "Draft ready to go",
  urgencyLevel: "normal",
};

const buildSnapshotRows = (includeDraft: boolean) => {
    const rows = [
      {
        job_id: JOB_RECORD.id,
        task: "job.diagnose",
        payload: DIAGNOSE_SNAPSHOT,
        updated_at: "2023-01-01T00:00:00Z",
      },
      {
        job_id: JOB_RECORD.id,
        task: "materials.generate",
        payload: MATERIALS_SNAPSHOT,
        updated_at: "2023-01-01T00:00:00Z",
      },
      {
        job_id: JOB_RECORD.id,
        task: "quote.generate",
        payload: QUOTE_SNAPSHOT,
        updated_at: "2023-01-01T00:00:00Z",
      },
      {
        job_id: JOB_RECORD.id,
        task: "job.followup",
      payload: FOLLOWUP_SNAPSHOT,
      updated_at: "2023-01-01T00:00:00Z",
    },
  ];
  if (includeDraft) {
    rows.push({
      job_id: JOB_RECORD.id,
      task: "job.after_call",
      payload: AFTER_CALL_SNAPSHOT_WITH_DRAFT,
      updated_at: "2023-01-01T00:00:00Z",
    });
  }
  return rows;
};

describe("Mobile Home follow-up draft readiness", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;
  let supabaseState: ReturnType<typeof createSupabaseState>;

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
    supabaseState = createSupabaseState({
      jobs: { data: [JOB_RECORD], error: null },
      askbob_job_task_snapshots: { data: buildSnapshotRows(false), error: null },
      quotes: { data: [QUOTE_RECORD], error: null },
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

  async function renderSubcopy(includeDraft: boolean) {
    supabaseState.responses["askbob_job_task_snapshots"] = {
      data: buildSnapshotRows(includeDraft),
      error: null,
    };

    const element = await MobileHomePage();
    act(() => {
      root?.render(element);
    });

    const card = container.querySelector('[data-testid="mobile-home-recommendation-card"]');
    expect(card).toBeTruthy();
    const subcopyElement = card?.querySelector(".mobile-home-instruction-subcopy");
    return subcopyElement?.textContent?.trim();
  }

  it("shows the follow-up due statement when no draft is ready", async () => {
    // followUpDraftReady on Home is driven by the presence of a non-empty job.after_call draftMessageBody row.
    const subcopy = await renderSubcopy(false);
    expect(subcopy).toBe("The customer hasn't confirmed timing yet.");
  });

  it("shows the draft-ready statement when there is a draft", async () => {
    const subcopy = await renderSubcopy(true);
    expect(subcopy).toBe("I recommend checking in with the customer today.");
  });
});
