import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const accordionPath = "app/(app)/jobs/[id]/JobProgressAccordion.tsx";
const forbiddenPatterns = [
  /"Waiting on"/i,
  /'Waiting on'/i,
  /"Draft ready"/i,
  /'Draft ready'/i,
  /"Completed"/i,
  /'Completed'/i,
  /"Review"/i,
  /'Review'/i,
  /"NOT READY"/i,
  /'NOT READY'/i,
  /"pipeline"/i,
  /'pipeline'/i,
  /"regenerate"/i,
  /'regenerate'/i,
  /"AI"/i,
  /'AI'/i,
];

describe("job progress accordion copy guard", () => {
  it("keeps inline progress text limited to canonical sources", async () => {
    const contents = await readFile(accordionPath, "utf8");
    for (const pattern of forbiddenPatterns) {
      expect(pattern.test(contents)).toBe(false);
    }
  });
});
