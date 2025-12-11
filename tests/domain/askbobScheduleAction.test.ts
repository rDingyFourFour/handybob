import { beforeEach, describe, expect, it, vi } from "vitest";

import * as askBobService from "@/lib/domain/askbob/service";
import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const mockGetCurrentWorkspace = vi.fn();

let supabaseState = setupSupabaseMock();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => supabaseState.supabase,
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: () => mockGetCurrentWorkspace(),
}));

let runAskBobJobScheduleAction: typeof import("@/app/(app)/askbob/job-schedule-actions").runAskBobJobScheduleAction;
let runAskBobTaskSpy: ReturnType<typeof vi.spyOn>;
let runAskBobTaskMock: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  runAskBobTaskSpy = vi.spyOn(askBobService, "runAskBobTask");
  const actionModule = await import("@/app/(app)/askbob/job-schedule-actions");
  runAskBobJobScheduleAction = actionModule.runAskBobJobScheduleAction;
});

afterAll(() => {
  runAskBobTaskSpy.mockRestore();
});

const jobRow = {
  id: "job-123",
  workspace_id: "workspace-1",
  status: "open",
  customer_id: "customer-1",
  description_raw: "Replace the faucet",
  title: "Faucet repair",
};

const defaultResponses = {
  jobs: { data: [jobRow], error: null },
  calls: { data: [{ id: "call-1", started_at: "2025-01-01T10:00:00Z" }], error: null },
  messages: { data: [{ id: "message-1", created_at: "2025-01-02T11:00:00Z", sent_at: null }], error: null },
  quotes: { data: [{ id: "quote-1", status: "sent", created_at: "2025-01-03T00:00:00Z", total: 100 }], error: null },
  invoices: { data: [{ id: "invoice-1", status: "sent", due_at: "2025-01-10T00:00:00Z" }], error: null },
  appointments: { data: [{ id: "appt-1", start_time: "2025-01-15T12:00:00Z", status: "confirmed" }], error: null },
};

const payloadTemplate = {
  workspaceId: "workspace-1",
  jobId: "job-123",
  preferredDays: ["Monday", "Tuesday"],
  preferredStartAt: "09:00",
  preferredEndAt: "15:00",
};

function buildPayload(overrides?: Partial<typeof payloadTemplate>) {
  return {
    workspaceId: "workspace-1",
    jobId: "job-123",
    preferredDays: ["Monday", " Wednesday "],
    preferredStartAt: "09:00",
    preferredEndAt: "15:00",
    ...overrides,
  };
}

beforeEach(() => {
  supabaseState = setupSupabaseMock(defaultResponses);
  runAskBobTaskMock = vi.fn();
  runAskBobTaskSpy.mockImplementation(runAskBobTaskMock);
  mockGetCurrentWorkspace.mockReset().mockResolvedValue({
    user: { id: "user-1" },
    workspace: { id: "workspace-1", name: "Demo", owner_id: "owner-1" },
    role: "owner",
  });
});

describe("runAskBobJobScheduleAction", () => {
  it("returns suggestions and logs UI request/success", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    runAskBobTaskMock.mockResolvedValue({
      suggestions: [
        {
          startAt: "2025-01-08T09:00:00-05:00",
          endAt: "2025-01-08T10:00:00-05:00",
          label: "Morning slot",
        },
      ],
      explanation: "Fits in between appointments",
      modelLatencyMs: 180,
    });

    const payload = buildPayload();
    const result = await runAskBobJobScheduleAction(payload);

    expect(result.ok).toBe(true);
    expect(result.suggestions).toHaveLength(1);
    expect(result.modelLatencyMs).toBe(180);
    expect(runAskBobTaskMock).toHaveBeenCalledOnce();
    expect(runAskBobTaskMock).toHaveBeenCalledWith(
      supabaseState.supabase,
      expect.objectContaining({
        task: "job.schedule",
        availability: expect.objectContaining({
          workingHours: { startAt: "09:00", endAt: "15:00" },
          preferredDays: ["Monday", "Wednesday"],
        }),
      })
    );
    expect(logSpy).toHaveBeenCalledWith(
      "[askbob-job-schedule-ui-request]",
      expect.objectContaining({ jobId: "job-123" }),
    );
    expect(logSpy).toHaveBeenCalledWith(
      "[askbob-job-schedule-ui-success]",
      expect.objectContaining({ suggestionsCount: 1, reason: "suggestions" }),
    );
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("handles no suggestions gracefully", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    runAskBobTaskMock.mockResolvedValue({
      suggestions: [],
      explanation: "Need more context",
      modelLatencyMs: 92,
    });

    const result = await runAskBobJobScheduleAction(payloadTemplate);

    expect(result.ok).toBe(true);
    expect(result.suggestions).toEqual([]);
    expect(result.explanation).toBe("Need more context");
    expect(result.modelLatencyMs).toBe(92);
    expect(logSpy).toHaveBeenCalledWith(
      "[askbob-job-schedule-ui-success]",
      expect.objectContaining({ reason: "no_suggestions", suggestionsCount: 0 }),
    );

    logSpy.mockRestore();
  });

  it("returns wrong_workspace when workspace does not match", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await runAskBobJobScheduleAction({
      workspaceId: "workspace-other",
      jobId: "job-123",
      preferredDays: ["Monday"],
      preferredStartAt: "09:00",
      preferredEndAt: "15:00",
    });

    expect(response).toEqual({ ok: false, error: "wrong_workspace" });
    expect(logSpy).not.toHaveBeenCalledWith("[askbob-job-schedule-ui-request]", expect.anything());
    expect(errorSpy).toHaveBeenCalledWith(
      "[askbob-job-schedule-ui-failure] workspace mismatch",
      expect.objectContaining({ payloadWorkspaceId: "workspace-other" }),
    );

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("returns job_not_found when the job cannot be queried", async () => {
    supabaseState.responses.jobs = { data: [], error: null };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await runAskBobJobScheduleAction(payloadTemplate);

    expect(response).toEqual({ ok: false, error: "job_not_found" });
    expect(errorSpy).toHaveBeenCalledWith(
      "[askbob-job-schedule-ui-failure] job not found",
      expect.objectContaining({ jobId: "job-123" }),
    );

    errorSpy.mockRestore();
  });
});
