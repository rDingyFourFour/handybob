import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const accordionPath = "app/(app)/jobs/[id]/JobProgressAccordion.tsx";

describe("job progress accordion import guard", () => {
  it("keeps the type-only import free of inline type modifiers", async () => {
    const contents = await readFile(accordionPath, "utf8");
    const inlineTypeModifierPattern = /import type \{[^}]*,\s*type /;

    expect(inlineTypeModifierPattern.test(contents)).toBe(false);
  });
});
