import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

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

import { callAskBobJobAfterCall } from "@/utils/openai/askbob";
import type { AskBobJobAfterCallInput } from "@/lib/domain/askbob/types";
import { __mockCreate } from "openai";

const buildInput = (overrides: Partial<AskBobJobAfterCallInput> = {}): AskBobJobAfterCallInput => ({
  task: "job.after_call",
  context: {
    workspaceId: "workspace-1",
    userId: "user-1",
    jobId: "job-A",
    customerId: "customer-1",
  },
  callId: "call-1",
  jobTitle: "Job Title",
  jobDescription: "Job description",
  callOutcome: "answered",
  recentJobSignals: null,
  callSummarySignals: null,
  ...overrides,
});

const modelResponse = {
  afterCallSummary: "Summary",
  recommendedActionLabel: "Do something",
  recommendedActionSteps: ["Step 1"],
  suggestedChannel: "sms",
  urgencyLevel: "normal",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("callAskBobJobAfterCall", () => {
  it("adds confirmation instructions when call scheduled an appointment", async () => {
    __mockCreate.mockResolvedValueOnce({
      model: "gpt-4",
      choices: [
        {
          message: {
            content: "```json\n" + JSON.stringify(modelResponse) + "\n```",
          },
        },
      ],
    });

    const input = buildInput({
      latestCallOutcome: {
        callId: "call-1",
        occurredAt: new Date().toISOString(),
        reachedCustomer: true,
        outcomeCode: "reached_scheduled",
        outcomeNotes: null,
        isAskBobAssisted: false,
      },
    });

    await callAskBobJobAfterCall(input);

    const message = __mockCreate.mock.calls[0][0].messages[1].content;
    expect(message).toContain("Call outcome context:");
    expect(message).toContain("Call outcome guidance:");
    expect(message).toContain("restates the scheduled time");
    expect(message).toContain("without asking for availability again");
  });

  it("instructs to mention voicemail and ask to text back", async () => {
    __mockCreate.mockResolvedValueOnce({
      model: "gpt-4",
      choices: [
        {
          message: {
            content: "```json\n" + JSON.stringify(modelResponse) + "\n```",
          },
        },
      ],
    });

    const input = buildInput({
      latestCallOutcome: {
        callId: "call-2",
        occurredAt: new Date().toISOString(),
        reachedCustomer: false,
        outcomeCode: "no_answer_left_voicemail",
        outcomeNotes: null,
        isAskBobAssisted: false,
      },
    });

    await callAskBobJobAfterCall(input);

    const message = __mockCreate.mock.calls[0][0].messages[1].content;
    expect(message).toContain("left a voicemail");
    expect(message).toContain("text back");
  });

  it("recommends a gentle check-in when no answer and no voicemail", async () => {
    __mockCreate.mockResolvedValueOnce({
      model: "gpt-4",
      choices: [
        {
          message: {
            content: "```json\n" + JSON.stringify(modelResponse) + "\n```",
          },
        },
      ],
    });

    const input = buildInput({
      latestCallOutcome: {
        callId: "call-3",
        occurredAt: new Date().toISOString(),
        reachedCustomer: false,
        outcomeCode: "no_answer_no_voicemail",
        outcomeNotes: null,
        isAskBobAssisted: false,
      },
    });

    await callAskBobJobAfterCall(input);

    const message = __mockCreate.mock.calls[0][0].messages[1].content;
    expect(message).toContain("gentle check-in text");
  });
});
