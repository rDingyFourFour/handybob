import {
  assertBobTone,
  bobifyStatus,
  containsForbiddenBobLanguage,
} from "@/lib/domain/copy/bobVoice";
import { describe, expect, it } from "vitest";

describe("bobVoice helpers", () => {
  it("normalizes statuses to calm phrases", () => {
    const cases: Array<[string, string]> = [
      ["NOT READY", "Waiting on diagnosis"],
      ["Pending", "Not yet"],
      ["FOLLOW-UP PENDING", "Waiting for response"],
      ["Draft ready", "Draft ready"],
      ["Materials ready", "Draft ready"],
      ["Completed", "Completed"],
      ["Done", "Completed"],
      ["Something unknown", "Not yet"],
    ];

    for (const [input, expected] of cases) {
      expect(bobifyStatus(input)).toBe(expected);
    }
  });

  it("finds forbidden Bob language", () => {
    const text =
      "Our pipeline model runs inference to regenerate the workflow, optimize the experience, and execute the plan.";
    const result = containsForbiddenBobLanguage(text);

    expect(result.ok).toBe(false);
    expect(result.hits).toEqual(
      expect.arrayContaining(["regenerate", "pipeline", "workflow", "model", "inference", "execute", "optimize"]),
    );
  });

  it("throws for uppercase status text", () => {
    expect(() => assertBobTone("NOT READY: RUN DIAGNOSE FIRST", "status")).toThrow();
  });

  it("throws for open-ended questions", () => {
    expect(() => assertBobTone("What would you like to do next?", "question")).toThrow();
  });

  it("throws when forbidden phrases appear", () => {
    expect(() => assertBobTone("AI-powered workflow optimized outcomes.", "ai")).toThrow();
  });

  it("validates a calm Bob-style message", () => {
    expect(() =>
      assertBobTone(
        "I reviewed this job and drafted a follow-up. The next step is to send it. Want me to send it?",
        "friendly",
      ),
    ).not.toThrow();
  });
});
