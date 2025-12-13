import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();
const runAskBobTaskMock = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: () => mockGetCurrentWorkspace(),
}));

vi.mock("@/lib/domain/askbob/service", () => ({
  runAskBobTask: (...args: unknown[]) => runAskBobTaskMock(...args),
}));

import { runAskBobJobAfterCallAction } from "@/app/(app)/askbob/after-call-actions";

const jobRow = {
  id: "job-1",
  workspace_id: "workspace-1",
  title: "Repair roof",
};

const defaultResponses = {
  jobs: { data: [jobRow], error: null },
  calls: { data: [], error: null },
  quotes: { data: [], error: null },
  invoices: { data: [], error: null },
  appointments: { data: [], error: null },
};

let supabaseState = setupSupabaseMock(defaultResponses);

beforeEach(() => {
  supabaseState = setupSupabaseMock(defaultResponses);
  createServerClientMock.mockReturnValue(supabaseState.supabase);
  mockGetCurrentWorkspace.mockResolvedValue({
    user: { id: "user-1" },
    workspace: { id: "workspace-1" },
  });
  runAskBobTaskMock.mockReset();
});

describe("runAskBobJobAfterCallAction", () => {
  it("errors when there are no calls for the job", async () => {
    const response = await runAskBobJobAfterCallAction({
      workspaceId: "workspace-1",
      jobId: "job-1",
    });

    expect(response).toEqual({ ok: false, code: "no_calls_for_job", jobId: "job-1" });
    expect(runAskBobTaskMock).not.toHaveBeenCalled();
  });

  it("dispatches the AskBob after-call task when a call exists", async () => {
    const callRow = {
      id: "call-1",
      job_id: "job-1",
      workspace_id: "workspace-1",
      status: "completed",
      outcome: null,
      duration_seconds: 180,
      started_at: new Date().toISOString(),
      summary: "Call summary",
      ai_summary: null,
      direction: "outbound",
      from_number: "111",
      to_number: "222",
      created_at: new Date().toISOString(),
      outcome_code: "reached_needs_followup",
      outcome_notes: " Follow-up note ",
      outcome_recorded_at: new Date().toISOString(),
      reached_customer: true,
    };
    supabaseState.responses.calls = { data: [callRow], error: null };
    const taskResult = {
      afterCallSummary: "Spoke with customer",
      recommendedActionLabel: "Send confirmation",
      recommendedActionSteps: ["Send SMS", "Log call"],
      suggestedChannel: "sms",
      urgencyLevel: "normal",
      modelLatencyMs: 123,
    };
    runAskBobTaskMock.mockResolvedValue(taskResult);

    const response = await runAskBobJobAfterCallAction({
      workspaceId: "workspace-1",
      jobId: "job-1",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.callId).toBe("call-1");
    expect(runAskBobTaskMock).toHaveBeenCalledOnce();
    const [, taskInput] = runAskBobTaskMock.mock.calls[0];
    expect(taskInput).toMatchObject({
      task: "job.after_call",
      callId: "call-1",
      callOutcome: "answered",
      latestCallOutcome: expect.objectContaining({
        callId: "call-1",
        reachedCustomer: true,
        outcomeCode: "reached_needs_followup",
        outcomeNotes: "Follow-up note",
        isAskBobAssisted: false,
      }),
    });
    expect(taskInput.callSummarySignals).toMatchObject({
      totalAttempts: 1,
      answeredCount: 1,
      voicemailCount: 0,
    });
    expect(response.result).toEqual(taskResult);
  });

  it("errors when the job is missing", async () => {
    supabaseState.responses.jobs = { data: [], error: null };
    const response = await runAskBobJobAfterCallAction({
      workspaceId: "workspace-1",
      jobId: "job-1",
    });
    expect(response).toEqual({ ok: false, code: "job_not_found" });
    expect(runAskBobTaskMock).not.toHaveBeenCalled();
  });

  it("errors when the workspace does not match", async () => {
    const response = await runAskBobJobAfterCallAction({
      workspaceId: "workspace-other",
      jobId: "job-1",
    });
    expect(response).toEqual({ ok: false, code: "wrong_workspace" });
    expect(runAskBobTaskMock).not.toHaveBeenCalled();
  });
});
