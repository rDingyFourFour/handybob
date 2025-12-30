import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const filePath = "app/(app)/jobs/[id]/NextStepCard.tsx";
const bannedPatterns = [/regenerate/i, /pipeline/i, /workflow/i, /AI-powered/i, /what would you like/i];

describe("Next Step copy guard", () => {
  it("keeps CTA render strings free of forbidden literals", async () => {
    const contents = await readFile(filePath, "utf8");
    for (const pattern of bannedPatterns) {
      expect(pattern.test(contents)).toBe(false);
    }
  });
});
