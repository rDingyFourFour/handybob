import { describe, expect, it, vi, beforeEach } from "vitest";

import type { AskBobJobScheduleInput } from "@/lib/domain/askbob/types";
import * as askBobOpenAi from "@/utils/openai/askbob";
import { runAskBobJobScheduleTask } from "@/lib/domain/askbob/service";

const callAskBobJobScheduleMock = vi.spyOn(askBobOpenAi, "callAskBobJobSchedule");

describe("runAskBobJobScheduleTask", () => {
  const buildInput = (): AskBobJobScheduleInput => ({
    task: "job.schedule",
    context: {
      workspaceId: "workspace-1",
      userId: "user-1",
      jobId: "job-123",
    },
    jobTitle: "Leaky faucet",
    jobDescription: "Schedule a visit to inspect the faucet.",
    followupDueStatus: "due",
    followupDueLabel: "Confirm visit",
    hasVisitScheduled: true,
    hasQuote: false,
    hasInvoice: false,
    notesSummary: "Customer prefers morning",
    availability: {
      workingHours: { startAt: "08:00", endAt: "17:00" },
      preferredDays: ["Monday", "Tuesday"],
      timezone: "America/New_York",
    },
  });

  beforeEach(() => {
    callAskBobJobScheduleMock.mockReset();
  });

  it("logs request and success when scheduling succeeds", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    callAskBobJobScheduleMock.mockResolvedValue({
      result: {
        slots: [
          {
            startAt: "2025-01-01T09:00:00-05:00",
            endAt: "2025-01-01T10:00:00-05:00",
            label: "Morning window",
          },
        ],
        rationale: "Recommend a morning slot",
        modelLatencyMs: 150,
      },
      latencyMs: 150,
      modelName: "gpt-4.1",
    });

    const result = await runAskBobJobScheduleTask(buildInput());

    expect(result.slots).toHaveLength(1);
    expect(logSpy).toHaveBeenCalledWith(
      "[askbob-job-schedule-request]",
      expect.objectContaining({ workspaceId: "workspace-1" }),
    );
    expect(logSpy).toHaveBeenCalledWith(
      "[askbob-job-schedule-success]",
      expect.objectContaining({ slotsCount: 1, modelLatencyMs: 150 }),
    );
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("logs and rethrows when the helper fails", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    callAskBobJobScheduleMock.mockRejectedValue(new Error("boom"));

    await expect(runAskBobJobScheduleTask(buildInput())).rejects.toThrow("boom");

    expect(logSpy).toHaveBeenCalledWith(
      "[askbob-job-schedule-request]",
      expect.objectContaining({ workspaceId: "workspace-1" }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[askbob-job-schedule-failure]",
      expect.objectContaining({ errorMessage: "boom" }),
    );

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
