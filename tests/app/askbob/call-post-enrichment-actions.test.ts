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

import { runAskBobCallPostEnrichmentAction } from "@/app/(app)/askbob/call-post-enrichment-actions";
import type { CallPostEnrichmentResult } from "@/lib/domain/askbob/types";

const defaultResponses = {
  calls: { data: [], error: null },
};

let supabaseState = setupSupabaseMock(defaultResponses);
let consoleLogMock: ReturnType<typeof vi.spyOn>;
let consoleErrorMock: ReturnType<typeof vi.spyOn>;

describe("runAskBobCallPostEnrichmentAction", () => {
  beforeEach(() => {
    supabaseState = setupSupabaseMock(defaultResponses);
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
    });
    runAskBobTaskMock.mockReset();
    consoleLogMock = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogMock.mockRestore();
    consoleErrorMock.mockRestore();
  });

  it("requires the call to be terminal", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-1",
          workspace_id: "workspace-1",
          job_id: "job-1",
          direction: "outbound",
          from_number: "+15550001111",
          to_number: "+15550002222",
          twilio_status: "in-progress",
          twilio_recording_sid: null,
          twilio_recording_url: null,
          summary: "Left a message",
          outcome_notes: null,
          transcript: null,
        },
      ],
      error: null,
    };

    const response = await runAskBobCallPostEnrichmentAction({
      workspaceId: "workspace-1",
      callId: "call-1",
    });

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.code).toBe("not_terminal");
    }
    expect(runAskBobTaskMock).not.toHaveBeenCalled();
    expect(consoleLogMock).toHaveBeenCalledWith(
      "[askbob-call-post-enrichment-ui-request]",
      expect.objectContaining({ callId: "call-1", isTerminal: false }),
    );
    expect(consoleLogMock).toHaveBeenCalledWith(
      "[askbob-call-post-enrichment-ui-failure] call not terminal",
      expect.objectContaining({ callId: "call-1", isTerminal: false }),
    );
  });

  it("rejects calls outside the workspace", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-2",
          workspace_id: "workspace-2",
          job_id: "job-2",
          direction: "outbound",
          from_number: "+15550003333",
          to_number: "+15550004444",
          twilio_status: "completed",
          twilio_recording_sid: null,
          twilio_recording_url: null,
          summary: null,
          outcome_notes: null,
          transcript: null,
        },
      ],
      error: null,
    };

    const response = await runAskBobCallPostEnrichmentAction({
      workspaceId: "workspace-1",
      callId: "call-2",
    });

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.code).toBe("call_not_found");
    }
    expect(runAskBobTaskMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalledWith(
      "[askbob-call-post-enrichment-ui-failure] call workspace mismatch",
      expect.objectContaining({ callId: "call-2" }),
    );
  });

  it("runs AskBob and returns structured results", async () => {
    supabaseState.responses.calls = {
      data: [
        {
          id: "call-3",
          workspace_id: "workspace-1",
          job_id: "job-3",
          direction: "outbound",
          from_number: "+15550005555",
          to_number: "+15550006666",
          twilio_status: "completed",
          twilio_recording_sid: "rec-1",
          twilio_recording_url: "https://example.com/rec",
          summary: "Customer requested a follow-up visit",
          outcome_notes: "Needs estimate",
          transcript: "Call notes",
        },
      ],
      error: null,
    };

    const result: CallPostEnrichmentResult = {
      summaryParagraph: "Summarized call.",
      keyMoments: ["Booked follow-up"],
      suggestedReachedCustomer: true,
      suggestedOutcomeCode: "reached_scheduled",
      outcomeRationale: "Confirmed on call",
      suggestedFollowupDraft: "Thanks for the time.",
      riskFlags: ["Permit required"],
      confidenceLabel: "high",
    };

    runAskBobTaskMock.mockResolvedValue(result);

    const response = await runAskBobCallPostEnrichmentAction({
      workspaceId: "workspace-1",
      callId: "call-3",
    });

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.result).toEqual(result);
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(runAskBobTaskMock).toHaveBeenCalledOnce();
    const [supabaseClient, taskInput] = runAskBobTaskMock.mock.calls[0];
    expect(supabaseClient).toBe(supabaseState.supabase);
    expect(taskInput).toMatchObject({
      task: "call.post_enrichment",
      workspaceId: "workspace-1",
      callId: "call-3",
      jobId: "job-3",
      direction: "outbound",
      fromNumber: "+15550005555",
      toNumber: "+15550006666",
      twilioStatus: "completed",
      hasRecording: true,
      hasNotes: true,
    });
    expect(consoleLogMock).toHaveBeenCalledWith(
      "[askbob-call-post-enrichment-ui-request]",
      expect.objectContaining({ callId: "call-3", isTerminal: true }),
    );
    expect(consoleLogMock).toHaveBeenCalledWith(
      "[askbob-call-post-enrichment-ui-success]",
      expect.objectContaining({ callId: "call-3", isTerminal: true }),
    );
  });
});
