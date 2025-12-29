import { validateCallSessionCopy } from "@/lib/ui/copy/callSessionCopy";
import { describe, expect, it } from "vitest";

describe("callSession copy Bob voice", () => {
  it("meets Bob tone expectations", () => {
    expect(() => validateCallSessionCopy()).not.toThrow();
  });
});
