import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { bobInstructionSentenceCopy } from "@/lib/domain/askbob/bobInstructionSentenceCopy";

const FILES_TO_SCAN = [
  "lib/domain/bob/bobInstruction.ts",
  "lib/domain/askbob/jobNextInstruction.ts",
  "lib/domain/askbob/homeInstruction.ts",
  "app/m/page.tsx",
  "app/m/jobs/[id]/page.tsx",
  "app/(app)/jobs/[id]/NextStepCard.tsx",
];

describe("Bob instruction sentence single-source guard", () => {
  it("keeps the canonical sentences in bobInstructionSentenceCopy.ts", () => {
    for (const filePath of FILES_TO_SCAN) {
      const content = readFileSync(join(process.cwd(), filePath), "utf8");
      for (const sentence of Object.values(bobInstructionSentenceCopy)) {
        if (content.includes(sentence)) {
          throw new Error(
            `Found forbidden Bob instruction sentence "${sentence}" in ${filePath}. Route through getBobInstructionSentence instead.`,
          );
        }
      }
    }
  });
});
