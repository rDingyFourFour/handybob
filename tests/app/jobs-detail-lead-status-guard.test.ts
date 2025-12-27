import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const JOB_DETAIL_PATH = path.join(
  process.cwd(),
  "app",
  "(app)",
  "jobs",
  "[id]",
  "page.tsx",
);

describe("job detail loader lead status guard", () => {
  it("does not filter lead status out of job detail lookups", () => {
    const content = fs.readFileSync(JOB_DETAIL_PATH, "utf8");
    const match = content.match(/\.from(?:<[^>]+>)?\("jobs"\)[\s\S]*?\.maybeSingle\(\)/);
    expect(match).not.toBeNull();
    const jobQuery = match?.[0] ?? "";

    expect(jobQuery.includes('.eq("status"')).toBe(false);
    expect(jobQuery.includes(".eq('status'")).toBe(false);

    const statusInMatch = jobQuery.match(/\.in\("status",[^\)]*\)/);
    if (statusInMatch) {
      expect(statusInMatch[0]).toContain("lead");
    }
  });
});
