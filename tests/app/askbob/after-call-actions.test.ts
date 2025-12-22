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
  transcript: null,
  twilio_call_sid: "CA123",
  twilio_status: "completed",
  twilio_status_updated_at: new Date().toISOString(),
  twilio_recording_url: null,
  twilio_recording_sid: null,
  twilio_recording_duration_seconds: null,
  twilio_recording_received_at: null,
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
      generationSource: "job_step_8",
    });

    expect(response).toEqual({ ok: false, code: "no_calls_for_job", jobId: "job-1" });
    expect(runAskBobTaskMock).not.toHaveBeenCalled();
  });

  it("dispatches the AskBob after-call task when a call exists", async () => {
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
    expect(taskInput.automatedCallNotes).toBeNull();
    expect(taskInput.callSummarySignals).toMatchObject({
      totalAttempts: 1,
      answeredCount: 1,
      voicemailCount: 0,
    });
    expect(response.result).toEqual(taskResult);
  });

  it("blocks call_session generation when the call is still in progress", async () => {
    const pendingCall = {
      ...callRow,
      twilio_status: "ringing",
      outcome_code: "reached_needs_followup",
      outcome_notes: "Follow-up note",
      outcome_recorded_at: new Date().toISOString(),
    };
    supabaseState.responses.calls = { data: [pendingCall], error: null };

    const response = await runAskBobJobAfterCallAction({
      workspaceId: "workspace-1",
      jobId: "job-1",
      callId: "call-1",
      generationSource: "call_session",
    });

    expect(response.ok).toBe(false);
    expect(response.code).toBe("not_ready_for_after_call");
    expect(runAskBobTaskMock).not.toHaveBeenCalled();
  });

  it("blocks call_session generation when no outcome is recorded", async () => {
    const noOutcomeCall = {
      ...callRow,
      outcome_code: null,
      outcome_notes: null,
      outcome_recorded_at: null,
    };
    supabaseState.responses.calls = { data: [noOutcomeCall], error: null };

    const response = await runAskBobJobAfterCallAction({
      workspaceId: "workspace-1",
      jobId: "job-1",
      callId: "call-1",
      generationSource: "call_session",
    });

    expect(response.ok).toBe(false);
    expect(response.code).toBe("not_ready_missing_outcome");
    expect(runAskBobTaskMock).not.toHaveBeenCalled();
  });

  it("blocks call_session generation when the reached flag is missing", async () => {
    const missingReachedCall = {
      ...callRow,
      reached_customer: null,
      outcome_code: "reached_needs_followup",
      outcome_notes: "Follow-up note",
      outcome_recorded_at: new Date().toISOString(),
    };
    supabaseState.responses.calls = { data: [missingReachedCall], error: null };

    const response = await runAskBobJobAfterCallAction({
      workspaceId: "workspace-1",
      jobId: "job-1",
      callId: "call-1",
      generationSource: "call_session",
    });

    expect(response.ok).toBe(false);
    expect(response.code).toBe("not_ready_missing_reached_flag");
    expect(runAskBobTaskMock).not.toHaveBeenCalled();
  });

  it("runs call_session generation when readiness is satisfied and logs telemetry", async () => {
    const readyCall = {
      ...callRow,
      twilio_status: "completed",
      outcome_code: "reached_needs_followup",
      outcome_notes: "Follow-up note",
      outcome_recorded_at: new Date().toISOString(),
      reached_customer: true,
    };
    supabaseState.responses.calls = { data: [readyCall], error: null };
    runAskBobTaskMock.mockResolvedValue({
      afterCallSummary: "Summary",
      recommendedActionLabel: "Next step",
      recommendedActionSteps: ["Do thing"],
      suggestedChannel: "sms",
      urgencyLevel: "normal",
      modelLatencyMs: 123,
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await runAskBobJobAfterCallAction({
      workspaceId: "workspace-1",
      jobId: "job-1",
      callId: "call-1",
      generationSource: "call_session",
    });

    expect(response.ok).toBe(true);
    expect(runAskBobTaskMock).toHaveBeenCalledOnce();
    expect(
      logSpy.mock.calls.some((args) => args[0] === "[askbob-after-call-ui-success]"),
    ).toBe(true);
    logSpy.mockRestore();
  });

  it("allows job_step_8 generation even when the call is not terminal", async () => {
    const pendingCall = {
      ...callRow,
      twilio_status: "ringing",
      outcome_code: null,
      outcome_notes: null,
      outcome_recorded_at: null,
    };
    supabaseState.responses.calls = { data: [pendingCall], error: null };
    const taskResult = {
      afterCallSummary: "Summary",
      recommendedActionLabel: "Next step",
      recommendedActionSteps: ["Do thing"],
      suggestedChannel: "sms",
      urgencyLevel: "normal",
      modelLatencyMs: 123,
    };
    runAskBobTaskMock.mockResolvedValue(taskResult);

    const response = await runAskBobJobAfterCallAction({
      workspaceId: "workspace-1",
      jobId: "job-1",
      generationSource: "job_step_8",
    });

    expect(response.ok).toBe(true);
    expect(runAskBobTaskMock).toHaveBeenCalled();
  });

  it("allows job_step_8 generation without a call id even when the call session would block", async () => {
    const pendingCall = {
      ...callRow,
      twilio_status: "ringing",
      outcome_code: null,
      outcome_notes: null,
      outcome_recorded_at: null,
    };
    supabaseState.responses.calls = { data: [pendingCall], error: null };
    const taskResult = {
      afterCallSummary: "Summary",
      recommendedActionLabel: "Next step",
      recommendedActionSteps: ["Do thing"],
      suggestedChannel: "sms",
      urgencyLevel: "normal",
      modelLatencyMs: 123,
    };
    runAskBobTaskMock.mockResolvedValue(taskResult);

    const response = await runAskBobJobAfterCallAction({
      workspaceId: "workspace-1",
      jobId: "job-1",
      generationSource: "job_step_8",
    });

    expect(response.ok).toBe(true);
    expect(runAskBobTaskMock).toHaveBeenCalledOnce();
  });

  it("treats an omitted generationSource as job_step_8 and bypasses call-session gating", async () => {
    const pendingCall = {
      ...callRow,
      twilio_status: "ringing",
      outcome_code: null,
      outcome_notes: null,
      outcome_recorded_at: null,
    };
    supabaseState.responses.calls = { data: [pendingCall], error: null };
    const taskResult = {
      afterCallSummary: "Summary",
      recommendedActionLabel: "Next step",
      recommendedActionSteps: ["Do thing"],
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
    expect(runAskBobTaskMock).toHaveBeenCalledOnce();
  });

  it("requires a call id when generating from the call session", async () => {
    const response = await runAskBobJobAfterCallAction({
      workspaceId: "workspace-1",
      jobId: "job-1",
      generationSource: "call_session",
    });

    expect(response.ok).toBe(false);
    expect(response.code).toBe("missing_call_id");
    expect(runAskBobTaskMock).not.toHaveBeenCalled();
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

  it("passes automated call notes to AskBob after-call input", async () => {
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
      outcome_notes: "Follow-up note",
      outcome_recorded_at: new Date().toISOString(),
      reached_customer: true,
    };
    supabaseState.responses.calls = { data: [callRow], error: null };
    runAskBobTaskMock.mockResolvedValue({
      afterCallSummary: "Summary",
      recommendedActionLabel: "Next step",
      recommendedActionSteps: ["Do thing"],
      suggestedChannel: "sms",
      urgencyLevel: "normal",
      modelLatencyMs: 123,
    });

    const response = await runAskBobJobAfterCallAction({
      workspaceId: "workspace-1",
      jobId: "job-1",
      automatedCallNotes: "  Live   updates  ",
    });

    expect(response.ok).toBe(true);
    const [, taskInput] = runAskBobTaskMock.mock.calls[0];
    expect(taskInput.automatedCallNotes).toBe("Live updates");
  });
});
