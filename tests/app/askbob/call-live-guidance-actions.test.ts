import { FormData as NodeFormData } from "formdata-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockResolveWorkspaceContext = vi.fn();
const runAskBobTaskMock = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain/workspaces")>(
    "@/lib/domain/workspaces",
  );
  return {
    ...actual,
    resolveWorkspaceContext: () => mockResolveWorkspaceContext(),
  };
});

vi.mock("@/lib/domain/askbob/service", () => ({
  runAskBobTask: (...args: unknown[]) => runAskBobTaskMock(...args),
}));

import { callLiveGuidanceAction } from "@/app/(app)/askbob/call-live-guidance-actions";
import type { CallLiveGuidanceResult } from "@/lib/domain/askbob/types";

const defaultResponses = {
  calls: { data: [], error: null },
  customers: { data: [], error: null },
  jobs: { data: [], error: null },
  quotes: { data: [], error: null },
};

let supabaseState = setupSupabaseMock(defaultResponses);
let consoleLogMock: ReturnType<typeof vi.spyOn>;
let consoleErrorMock: ReturnType<typeof vi.spyOn>;

describe("callLiveGuidanceAction", () => {
  beforeEach(() => {
    supabaseState = setupSupabaseMock(defaultResponses);
    createServerClientMock.mockReturnValue(supabaseState.supabase);
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
    runAskBobTaskMock.mockReset();
    consoleLogMock = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogMock.mockRestore();
    consoleErrorMock.mockRestore();
  });

  it("returns live guidance when the inbound call is linked", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-1",
          workspace_id: "workspace-1",
          direction: "inbound",
          job_id: "job-1",
          customer_id: "customer-1",
          from_number: "+15550001111",
          to_number: "+15550002222",
          summary: null,
          ai_summary: "AI summary",
          outcome: null,
          outcome_code: "reached_needs_followup",
          outcome_notes: "Needs follow-up",
          outcome_recorded_at: "2023-01-01T12:00:00.000Z",
          reached_customer: true,
          created_at: "2023-01-01T11:55:00.000Z",
        },
      ],
      error: null,
    };
    supabaseState.responses.customers = {
      data: [{ id: "customer-1", workspace_id: "workspace-1", name: "Jane Doe" }],
      error: null,
    };
    supabaseState.responses.jobs = {
      data: [
        {
          id: "job-1",
          workspace_id: "workspace-1",
          title: "Roof repair",
          status: "active",
          customer_id: "customer-1",
        },
      ],
      error: null,
    };
    supabaseState.responses.quotes = {
      data: [
        {
          id: "quote-1",
          status: "sent",
          total: 321.45,
        },
      ],
      error: null,
    };

    const liveGuidanceResult: CallLiveGuidanceResult = {
      openingLine: "Hello",
      questions: ["Ask about accessibility"],
      confirmations: ["Confirm address"],
      nextActions: ["Schedule visit"],
      guardrails: ["Escalate if permits needed"],
      summary: "Focus on scheduling in the afternoon.",
      phasedPlan: ["Phase 1: Confirm availability", "Phase 2: Validate permits"],
      nextBestQuestion: "Can we book the visit for Thursday afternoon?",
      riskFlags: ["Permit documentation required"],
      changedRecommendation: true,
      changedReason: "Notes shifted preferences to afternoons.",
      modelLatencyMs: 5,
      rawModelOutput: null,
    };
    runAskBobTaskMock.mockResolvedValue(liveGuidanceResult);

    const formData = new NodeFormData();
    formData.set("workspaceId", "workspace-1");
    formData.set("callId", "call-1");
    formData.set("customerId", "customer-1");
    formData.set("guidanceMode", "intake");
    formData.set("callGuidanceSessionId", "session-1");
    formData.set("cycleIndex", "1");
    formData.set("notesText", "Customer update");

    const response = await callLiveGuidanceAction(formData);

    expect(response.success).toBe(true);
    expect(response.result).toBe(liveGuidanceResult);
    expect(runAskBobTaskMock).toHaveBeenCalledOnce();

    const [supabaseClient, taskInput] = runAskBobTaskMock.mock.calls[0];
    expect(supabaseClient).toBe(supabaseState.supabase);
    expect(taskInput).toMatchObject({
      task: "call.live_guidance",
      workspaceId: "workspace-1",
      callId: "call-1",
      customerId: "customer-1",
      jobId: "job-1",
      guidanceMode: "intake",
      fromNumber: "+15550001111",
      toNumber: "+15550002222",
      notesText: "Customer update",
      callGuidanceSessionId: "session-1",
      cycleIndex: 1,
      customerName: "Jane Doe",
      jobTitle: "Roof repair",
      jobStatus: "active",
      direction: "inbound",
      quoteId: "quote-1",
      quoteSummary: "Quote quote-1… · status: sent · total: $321.45",
      extraDetails: "AI summary",
    });
    expect(typeof taskInput.latestCallOutcomeLabel).toBe("string");
    expect(taskInput.latestCallOutcomeLabel).toContain("Reached");
    expect(taskInput.latestCallOutcomeContext).toContain("Latest call outcome:");

    expect(consoleLogMock).toHaveBeenCalledWith(
      "[askbob-call-live-guidance-request]",
      expect.objectContaining({ workspaceId: "workspace-1", callId: "call-1" }),
    );
    expect(consoleLogMock).toHaveBeenCalledWith(
      "[askbob-call-live-guidance-success]",
      expect.objectContaining({ guidanceMode: "intake" }),
    );
    expect(consoleErrorMock).not.toHaveBeenCalled();
  });

  it("returns an error when the call is not linked to a customer", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-2",
          workspace_id: "workspace-1",
          direction: "inbound",
          job_id: null,
          customer_id: null,
          from_number: "+15550003333",
          to_number: "+15550004444",
          summary: null,
          ai_summary: null,
          outcome: null,
          outcome_code: null,
          outcome_notes: null,
          outcome_recorded_at: null,
          reached_customer: null,
          created_at: "2023-01-02T12:00:00.000Z",
        },
      ],
      error: null,
    };

    const formData = new NodeFormData();
    formData.set("workspaceId", "workspace-1");
    formData.set("callId", "call-2");
    formData.set("customerId", "customer-1");
    formData.set("guidanceMode", "scheduling");
    formData.set("callGuidanceSessionId", "session-1");
    formData.set("cycleIndex", "1");

    const response = await callLiveGuidanceAction(formData);

    expect(response.success).toBe(false);
    expect(response.code).toBe("call_missing_customer");
    expect(runAskBobTaskMock).not.toHaveBeenCalled();

    expect(consoleLogMock).toHaveBeenCalledWith(
      "[askbob-call-live-guidance-request]",
      expect.objectContaining({ callId: "call-2" }),
    );
    expect(consoleErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("[askbob-call-live-guidance-failure] call missing customer"),
      expect.objectContaining({ callId: "call-2", source: "askbob.call-live-guidance" }),
    );
  });
});
