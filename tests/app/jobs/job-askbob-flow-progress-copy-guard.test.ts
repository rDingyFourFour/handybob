import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const flowPath = "components/askbob/JobAskBobFlow.tsx";
const forbiddenPatterns = [
  /"Waiting on"/,
  /'Waiting on'/,
  /"Draft ready"/,
  /'Draft ready'/,
  /"Completed"/,
  /'Completed'/,
  /"NOT READY"/,
  /'NOT READY'/,
];

describe("job askbob flow progress copy guard", () => {
  it("does not inline progress status literals", async () => {
    const contents = await readFile(flowPath, "utf8");
    for (const pattern of forbiddenPatterns) {
      expect(pattern.test(contents)).toBe(false);
    }
  });
});
