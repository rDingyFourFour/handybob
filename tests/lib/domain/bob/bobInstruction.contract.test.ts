import { describe, expect, it } from "vitest";

import { buildBobInstruction } from "@/lib/domain/bob/bobInstruction";

describe("bobInstruction contract", () => {
  it("throws when Bob tone is violated", () => {
    expect(() =>
      buildBobInstruction({
        statement: "Regenerate that job",
        recommendation: "Keep going",
        stepType: "idle",
      }),
    ).toThrow(/Bob voice violation/);
  });

  it("normalizes CTA labels and returns telemetry", () => {
    const instruction = buildBobInstruction({
      statement: "I reviewed the job.",
      recommendation: "Review the next step.",
      stepType: "diagnose",
      primaryCta: {
        label: "Regenerate plan",
        actionType: "navigate",
        href: "/jobs/1",
      },
    });
    expect(instruction.primaryCta?.label).toBe("Update plan");
    expect(instruction.telemetry.stepType).toBe("diagnose");
    expect(instruction.telemetry.hasPrimaryCta).toBe(true);
  });
});
