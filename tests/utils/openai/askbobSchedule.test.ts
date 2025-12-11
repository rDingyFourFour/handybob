import { describe, expect, it, vi, beforeEach, afterEach, type Mock } from "vitest";

declare module "openai" {
  export const __mockCreate: Mock<Promise<unknown>, [unknown]>;
}

vi.mock("openai", () => {
  const createMock = vi.fn();
  class OpenAiMock {
    chat = {
      completions: {
        create: createMock,
      },
    };
  }
  return {
    default: OpenAiMock,
    __mockCreate: createMock,
  };
});

import type { AskBobJobScheduleInput } from "@/lib/domain/askbob/types";
import { callAskBobJobSchedule } from "@/utils/openai/askbob";
import { __mockCreate } from "openai";

describe("callAskBobJobSchedule", () => {
  const buildInput = (): AskBobJobScheduleInput => ({
    task: "job.schedule",
    context: {
      workspaceId: "workspace-1",
      userId: "user-1",
    },
    jobTitle: "Leaky faucet",
    jobDescription: "Fix the leaky faucet near the sink.",
    followupDueStatus: "due",
    followupDueLabel: "Follow-up about the customer approval",
    hasVisitScheduled: false,
    hasQuote: false,
    hasInvoice: false,
    notesSummary: "Customer is available next week",
    availability: {
      workingHours: { startAt: "08:00", endAt: "17:00" },
      preferredDays: ["Monday", "Tuesday"],
      timezone: "America/New_York",
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("parses JSON output, truncates to 3 suggestions, and logs the truncation", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const suggestionPayload = {
      suggestions: [
        {
          startAt: "2025-01-01T09:00:00-05:00",
          endAt: "2025-01-01T10:00:00-05:00",
          label: "Morning visit",
          reason: "Follows customer availability",
          urgency: "high",
        },
        {
          startAt: "2025-01-02T11:00:00-05:00",
          endAt: "2025-01-02T12:00:00-05:00",
          label: "Midday check-in",
          urgency: "medium",
        },
        {
          startAt: "2025-01-03T14:00:00-05:00",
          endAt: "2025-01-03T15:00:00-05:00",
          label: "Afternoon slot",
        },
        {
          startAt: "2025-01-04T16:00:00-05:00",
          endAt: "2025-01-04T17:00:00-05:00",
          label: "Late window",
        },
      ],
      explanation: "These slots respect the provided working hours.",
    };
    __mockCreate.mockResolvedValue({
      model: "gpt-4.1",
      choices: [
        {
          message: {
            content: "```json\n" +
              JSON.stringify(suggestionPayload) +
              "\n```",
          },
        },
      ],
    });

    const result = await callAskBobJobSchedule(buildInput());

    expect(result.result.suggestions.length).toBe(3);
    expect(result.result.explanation).toBe(suggestionPayload.explanation);
    expect(logSpy).toHaveBeenCalledWith(
      "[askbob-job-schedule-truncated]",
      expect.objectContaining({
        workspaceId: "workspace-1",
        suggestionsBefore: 4,
        suggestionsAfter: 3,
      }),
    );

    logSpy.mockRestore();
  });
});
