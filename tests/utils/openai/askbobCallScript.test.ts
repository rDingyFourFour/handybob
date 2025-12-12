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

import type { AskBobJobCallScriptInput } from "@/lib/domain/askbob/types";
import { callAskBobJobCallScript } from "@/utils/openai/askbob";
import { __mockCreate } from "openai";

const buildInput = (
  overrides: Partial<AskBobJobCallScriptInput> = {},
): AskBobJobCallScriptInput => ({
  task: "job.call_script",
  context: {
    workspaceId: "workspace-1",
    userId: "user-1",
    jobId: "job-123",
  },
  callPurpose: "intake",
  callTone: "friendly and clear",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

const scriptPayload = {
  scriptBody: "Main script body",
  openingLine: "Greeting",
  closingLine: "Thanks",
  keyPoints: ["Point A"],
  suggestedDurationMinutes: 4,
};

describe("callAskBobJobCallScript", () => {
  it("includes the fallback persona description and logs the absence of a persona", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    __mockCreate.mockResolvedValueOnce({
      model: "gpt-4.1",
      choices: [{ message: { content: "```json\n" + JSON.stringify(scriptPayload) + "\n```" } }],
    });

    await callAskBobJobCallScript(buildInput());

    const completionCall = __mockCreate.mock.calls[0][0];
    expect(completionCall.messages[1].content).toContain(
      "Persona / tone:\nSpeak in a friendly, professional tone that stays helpful, concise, and respectful while keeping the script clearly actionable.",
    );
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        hasPersonaStyle: false,
        personaStyle: null,
        hasCallIntents: false,
        callIntentsCount: 0,
      }),
    );

    logSpy.mockRestore();
  });

  it("maps a provided persona to its description and logs it", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    __mockCreate.mockResolvedValueOnce({
      model: "gpt-4.1",
      choices: [{ message: { content: "```json\n" + JSON.stringify(scriptPayload) + "\n```" } }],
    });

    await callAskBobJobCallScript(
      buildInput({
        callPersonaStyle: "direct_concise",
      }),
    );

    const completionCall = __mockCreate.mock.calls[0][0];
    expect(completionCall.messages[1].content).toContain(
      "Persona / tone:\nSpeak in a clear, direct, concise tone that respects the customer's time and focuses on key facts.",
    );
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        hasPersonaStyle: true,
        personaStyle: "direct_concise",
        hasCallIntents: false,
        callIntentsCount: 0,
      }),
    );

    logSpy.mockRestore();
  });

  it("includes primary call goals when intents are provided", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    __mockCreate.mockResolvedValueOnce({
      model: "gpt-4.1",
      choices: [{ message: { content: "```json\n" + JSON.stringify(scriptPayload) + "\n```" } }],
    });

    await callAskBobJobCallScript(
      buildInput({
        callIntents: ["quote_followup", "schedule_visit"],
      }),
    );

    const completionCall = __mockCreate.mock.calls[0][0];
    const userMessage = completionCall.messages[1].content;
    expect(userMessage).toContain("Primary call goals:");
    expect(userMessage).toContain("Follow up on a quote, review status, and guide the customer toward a decision.");
    expect(userMessage).toContain("Book or adjust an in-person visit, confirm timing, and clarify logistics.");
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        hasCallIntents: true,
        callIntentsCount: 2,
      }),
    );

    logSpy.mockRestore();
  });
});
