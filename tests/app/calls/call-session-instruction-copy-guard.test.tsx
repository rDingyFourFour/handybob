import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { callSessionInstructionCopy } from "@/lib/ui/copy/callSessionInstructionCopy";

const targetFiles = [
  "app/(app)/calls/[id]/page.tsx",
  "app/(app)/calls/[id]/CallPrimaryActionBar.tsx",
];

const bannedStrings = Object.values(callSessionInstructionCopy.primaryCta.explanation).filter(
  Boolean,
);

describe("Call session instruction copy guard", () => {
  it("keeps CTA explanations inside the copy map", async () => {
    for (const filePath of targetFiles) {
      const contents = await readFile(filePath, "utf8");
      for (const literal of bannedStrings) {
        expect(contents.includes(literal)).toBe(false);
      }
    }
  });
});
