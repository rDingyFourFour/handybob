import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

function collectFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    } else if (statSync(fullPath).isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("public pages use server guard", () => {
  it("keeps use server out of public pages and routes", () => {
    const publicRoot = join(process.cwd(), "app", "public");
    const publicFiles = collectFiles(publicRoot).filter(
      (file) => file.endsWith("page.tsx") || file.endsWith("route.ts"),
    );
    const offenders: string[] = [];

    for (const file of publicFiles) {
      const contents = readFileSync(file, "utf8");
      if (contents.includes("use server")) {
        offenders.push(relative(process.cwd(), file));
      }
    }

    expect(offenders, "Public pages/routes should not include the use server directive").toEqual(
      [],
    );
  });
});
