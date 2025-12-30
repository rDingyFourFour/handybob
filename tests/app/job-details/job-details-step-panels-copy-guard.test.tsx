import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const panelFiles = [
  "components/askbob/JobAskBobPanel.tsx",
  "components/askbob/AskBobMaterialsPanel.tsx",
  "components/askbob/AskBobQuotePanel.tsx",
  "components/askbob/JobAskBobFollowupPanel.tsx",
];

const bannedPatterns = [/AskBob has generated/i, /Waiting on/i, /Draft ready/i];

describe("Job Details step panel copy guard", () => {
  for (const file of panelFiles) {
    it(`ensures ${file} is free of inline derived copy`, async () => {
      const contents = await readFile(file, "utf8");
      for (const pattern of bannedPatterns) {
        expect(pattern.test(contents)).toBe(false);
      }
    });
  }
});
