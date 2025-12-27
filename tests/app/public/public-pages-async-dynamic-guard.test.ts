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

describe("public pages async params/searchParams guard", () => {
  it("avoids sync access to params/searchParams in public pages", () => {
    const publicRoot = join(process.cwd(), "app", "public");
    const pageFiles = collectFiles(publicRoot).filter((file) => file.endsWith("page.tsx"));
    const offenders: string[] = [];

    for (const file of pageFiles) {
      const contents = readFileSync(file, "utf8");
      if (contents.includes("params.") || contents.includes("searchParams.")) {
        offenders.push(relative(process.cwd(), file));
      }
    }

    expect(offenders, "Public page files should not access params/searchParams synchronously").toEqual(
      [],
    );
  });
});
