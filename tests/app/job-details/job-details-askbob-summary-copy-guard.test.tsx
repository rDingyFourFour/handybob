import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const summaryPath = "app/(app)/jobs/[id]/AskBobSummaryCard.tsx";
const bannedPatterns = [/View details/, /Hide details/, /AskBob has generated/, /Review/];

describe("AskBob summary copy guard", () => {
  it("keeps inline copy out of the summary card", async () => {
    const contents = await readFile(summaryPath, "utf8");
    for (const pattern of bannedPatterns) {
      expect(pattern.test(contents)).toBe(false);
    }
  });
});
