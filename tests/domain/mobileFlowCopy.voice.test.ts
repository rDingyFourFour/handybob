import { describe, expect, it } from "vitest";

import { validateMobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";

describe("mobile flow copy voice guard", () => {
  it("keeps every line in Bob tone", () => {
    expect(() => validateMobileFlowCopy()).not.toThrow();
  });
});
