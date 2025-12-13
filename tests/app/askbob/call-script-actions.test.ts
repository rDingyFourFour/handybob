import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();
const mockRunAskBobTask = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: () => mockGetCurrentWorkspace(),
}));

vi.mock("@/lib/domain/askbob/service", () => ({
  runAskBobTask: (...args: unknown[]) => mockRunAskBobTask(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { runAskBobCallScriptAction } from "@/app/(app)/askbob/call-script-actions";

let supabaseState = setupSupabaseMock();
const jobRow = {
  id: "job-1",
  workspace_id: "workspace-1",
  customer_id: "customer-1",
  title: "Fix faucet",
};
const defaultResponses = {
  jobs: { data: [jobRow], error: null },
};

const askBobTaskResult = {
  scriptBody: "Opening line\nMain script body\nClosing",
  openingLine: "Hello",
  closingLine: "Thanks",
  keyPoints: ["Point A"],
  suggestedDurationMinutes: 5,
  modelLatencyMs: 150,
};

beforeEach(() => {
  vi.clearAllMocks();
  supabaseState = setupSupabaseMock(defaultResponses);
  createServerClientMock.mockReturnValue(supabaseState.supabase);
  mockGetCurrentWorkspace.mockResolvedValue({
    user: { id: "user-1" },
    workspace: { id: "workspace-1" },
    role: "owner",
  });
  mockRunAskBobTask.mockResolvedValue(askBobTaskResult);
});

describe("runAskBobCallScriptAction", () => {
  it("logs persona metadata and forwards the selected persona to AskBob", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await runAskBobCallScriptAction({
      workspaceId: "workspace-1",
      jobId: "job-1",
      customerId: "customer-1",
      callPurpose: "followup",
      callTone: "friendly and clear",
      callPersonaStyle: "direct_concise",
    });

    expect(response.ok).toBe(true);
    expect(mockRunAskBobTask).toHaveBeenCalledTimes(1);
    const taskInput = mockRunAskBobTask.mock.calls[0][1];
    expect(taskInput.callPersonaStyle).toBe("direct_concise");

    expect(logSpy.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        hasPersonaStyle: true,
        personaStyle: "direct_concise",
      }),
    );
    expect(logSpy.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        hasPersonaStyle: true,
        personaStyle: "direct_concise",
      }),
    );

    logSpy.mockRestore();
  });

  it("sanitizes call intents, logs counts, and forwards them to AskBob", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await runAskBobCallScriptAction({
      workspaceId: "workspace-1",
      jobId: "job-1",
      customerId: "customer-1",
      callPurpose: "followup",
      callTone: "friendly and clear",
      callIntents: ["quote_followup", "quote_followup", "schedule_visit"],
    });

    expect(response.ok).toBe(true);
    expect(mockRunAskBobTask).toHaveBeenCalledTimes(1);
    const taskInput = mockRunAskBobTask.mock.calls[0][1];
    expect(taskInput.callIntents).toEqual(["quote_followup", "schedule_visit"]);

    expect(logSpy.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        hasCallIntents: true,
        callIntentsCount: 2,
        callIntents: ["quote_followup", "schedule_visit"],
      }),
    );
    expect(logSpy.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        hasCallIntents: true,
        callIntentsCount: 2,
        callIntents: ["quote_followup", "schedule_visit"],
      }),
    );

    logSpy.mockRestore();
  });

  it("passes the latest call outcome context when available", async () => {
    const response = await runAskBobCallScriptAction({
      workspaceId: "workspace-1",
      jobId: "job-1",
      callPurpose: "followup",
      callTone: "friendly and clear",
      latestCallOutcome: {
        callId: "call-42",
        occurredAt: "2025-01-10T09:00:00Z",
        reachedCustomer: true,
        outcomeCode: "reached_scheduled",
        outcomeNotes: "Left a reminder",
        isAskBobAssisted: false,
        displayLabel: "Reached · Scheduled · 2025-01-10 09:00",
      },
    });

    expect(response.ok).toBe(true);
    const taskInput = mockRunAskBobTask.mock.calls[0][1];
    expect(taskInput.latestCallOutcome).toMatchObject({ callId: "call-42" });
    expect(taskInput.latestCallOutcomeContext).toContain("Latest call outcome:");
  });
});
