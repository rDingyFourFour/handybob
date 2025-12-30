import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const guardedFiles = [
  "app/m/page.tsx",
  "app/m/jobs/[id]/page.tsx",
  "app/m/follow-up/page.tsx",
];

const bannedPatterns = [
  /["']Home["']/,
  /["']Review job["']/,
  /["']Bob's next step["']/,
  /["']Focus on this step to keep the job moving forward\.["']/,
  /["']Everything looks on track for this job\.["']/,
  /["']View job details["']/,
  /["']Follow-up draft["']/,
  /["']AskBob is preparing a follow-up for this job\. We'll show it here soon\.["']/,
  /["']Back to active job["']/,
  /["']Good morning["']/,
  /["']You're all caught up["']/,
];

describe("Mobile flow copy guard", () => {
  for (const file of guardedFiles) {
    it(`avoids inline copy in ${file}`, async () => {
      const contents = await readFile(file, "utf8");
      for (const pattern of bannedPatterns) {
        expect(pattern.test(contents)).toBe(false);
      }
    });
  }
});
