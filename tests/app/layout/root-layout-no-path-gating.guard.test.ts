import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

describe("root layout path gating guard", () => {
  it("does not import next/headers or call headers()", () => {
    const layoutSource = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf-8");
    expect(layoutSource).not.toContain('from "next/headers"');
    expect(layoutSource).not.toMatch(/headers\s*\(/);
  });
});
