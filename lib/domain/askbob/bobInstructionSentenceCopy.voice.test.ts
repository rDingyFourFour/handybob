import { describe, expect, it } from "vitest";

import { validateBobInstructionSentenceCopy } from "@/lib/domain/askbob/bobInstructionSentenceCopy";

describe("bobInstructionSentenceCopy voice guard", () => {
  it("keeps every sentence in Bob tone", () => {
    expect(() => validateBobInstructionSentenceCopy()).not.toThrow();
  });
});
