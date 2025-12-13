import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

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

import type { AskBobJobFollowupInput } from "@/lib/domain/askbob/types";
import { callAskBobJobFollowup } from "@/utils/openai/askbob";
import { __mockCreate } from "openai";

const baseInput = (
  overrides: Partial<AskBobJobFollowupInput> = {},
): AskBobJobFollowupInput => ({
  task: "job.followup",
  context: {
    workspaceId: "workspace-1",
    userId: "user-1",
    jobId: "job-A",
  },
  jobTitle: "Test job",
  jobStatus: "open",
  hasScheduledVisit: false,
  lastMessageAt: null,
  lastCallAt: null,
  lastQuoteAt: null,
  lastInvoiceDueAt: null,
  followupDueStatus: "none",
  followupDueLabel: "None",
  hasOpenQuote: false,
  hasUnpaidInvoice: false,
  notesSummary: null,
  callSummarySignals: null,
  ...overrides,
});

const sampleResult = {
  recommendedAction: "Do the thing",
  rationale: "Because reasons",
  steps: [],
  shouldSendMessage: false,
  shouldScheduleVisit: false,
  shouldCall: false,
  shouldWait: true,
  modelLatencyMs: 10,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("callAskBobJobFollowup", () => {
  it("includes the latest call outcome context when provided", async () => {
    __mockCreate.mockResolvedValueOnce({
      model: "gpt-4",
      choices: [
        {
          message: {
            content: "```json\n" + JSON.stringify(sampleResult) + "\n```",
          },
        },
      ],
    });

    const callOutcomeContext = [
      "Latest call outcome:",
      "- Reached customer: yes",
      "- Outcome: Reached · Needs follow-up",
      "- Occurred at: Today, 10:00 AM",
      "- Appointment scheduled: no",
      "- Voicemail left: no",
    ].join("\n");

    await callAskBobJobFollowup(
      baseInput({
        latestCallOutcomeContext: callOutcomeContext,
        latestCallOutcome: {
          callId: "call-1",
          occurredAt: new Date().toISOString(),
          reachedCustomer: true,
          outcomeCode: "reached_needs_followup",
          outcomeNotes: "Short note",
          isAskBobAssisted: false,
        },
      }),
    );

    const userMessage = __mockCreate.mock.calls[0][0].messages[1].content;
    expect(userMessage).toContain("Call outcome context:");
    expect(userMessage).toContain("Reached customer: yes");
    expect(userMessage).toContain("Appointment scheduled: no");
    expect(userMessage).toContain("Voicemail left: no");
  });

  it("omits the latest call outcome block when none is provided", async () => {
    __mockCreate.mockResolvedValueOnce({
      model: "gpt-4",
      choices: [
        {
          message: {
            content: "```json\n" + JSON.stringify(sampleResult) + "\n```",
          },
        },
      ],
    });

    await callAskBobJobFollowup(baseInput());

    const userMessage = __mockCreate.mock.calls[0][0].messages[1].content;
    expect(userMessage).not.toContain("Call outcome context:");
  });
});
