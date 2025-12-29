import { validateJobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import { describe, expect, it } from "vitest";

describe("jobDetails copy Bob voice", () => {
  it("meets Bob tone expectations", () => {
    expect(() => validateJobDetailsCopy()).not.toThrow();
  });
});
