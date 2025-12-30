import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const guardedFiles = [
  "app/(app)/jobs/[id]/JobBriefCard.tsx",
  "app/(app)/jobs/[id]/page.tsx",
];

const bannedPatterns = [
  /["']Back to jobs["']/,
  /["']Job brief["']/,
  /["']Next step["']/,
  /["']All caught up["']/,
  /["']Waiting on["']/,
  /["']Draft ready["']/,
  /["']Review["']/,
];

describe("Job Details job brief copy guard", () => {
  for (const file of guardedFiles) {
    it(`keeps inline copy out of ${file}`, async () => {
      const contents = await readFile(file, "utf8");
      for (const pattern of bannedPatterns) {
        expect(pattern.test(contents)).toBe(false);
      }
    });
  }
});
