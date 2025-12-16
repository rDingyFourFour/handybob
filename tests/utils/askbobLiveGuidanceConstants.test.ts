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

import type { CallLiveGuidanceInput } from "@/lib/domain/askbob/types";
import { callAskBobLiveGuidance } from "@/utils/openai/askbob";
import { __mockCreate } from "openai";

describe("callAskBobLiveGuidance safety of live guidance constants", () => {
  const buildInput = (): CallLiveGuidanceInput => ({
    task: "call.live_guidance",
    workspaceId: "workspace-1",
    callId: "call-1",
    customerId: "customer-1",
    callGuidanceSessionId: "session-1",
    guidanceMode: "intake",
    cycleIndex: 0,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("loads without exploding and respects canonical signals", async () => {
    const payload = {
      openingLine: "Hi, this is AskBob.",
      questions: ["What's happening on site?"],
      confirmations: ["Is the workspace clear?"],
      nextActions: ["Call the customer back if needed."],
      guardrails: ["Stop if you hear any screaming."],
      talkTrackNextLine: "Let me confirm the details first.",
      pauseNow: false,
      confirmBeforeProceeding: "Can I continue?",
      objectionSignals: ["pricing_concern"],
      escalationSignal: "supervisor_required",
      escalationReason: "Customer mentioned a safety risk.",
      summary: "Guidance summary.",
      phasedPlan: ["Phase 1", "Phase 2"],
      nextBestQuestion: "Is anyone injured?",
      riskFlags: ["safety_concern"],
      changedRecommendation: false,
    };

    __mockCreate.mockResolvedValue({
      model: "gpt-4o-mini",
      choices: [
        {
          message: {
            content: "```json\n" + JSON.stringify(payload) + "\n```",
          },
        },
      ],
    });

    const result = await callAskBobLiveGuidance(buildInput());

    expect(result.result.objectionSignals).toEqual(["pricing_concern"]);
    expect(result.result.escalationSignal).toBe("supervisor_required");
    expect(result.result.summary).toBe(payload.summary);
    expect(result.result.guardrails).toContain("Stop if you hear any screaming.");
  });
});
