import { describe, expect, it } from "vitest";

import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";

describe("callSessionCopy contract", () => {
  it("keeps key call session copy nodes non-empty", () => {
    const requiredStrings = [
      callSessionCopy.header.title,
      callSessionCopy.mode.title,
      callSessionCopy.primaryCta.label.startAutomated,
      callSessionCopy.primaryCta.label.startGuided,
      callSessionCopy.primaryCta.explanation.select_call_mode,
      callSessionCopy.wrapUp.title,
      callSessionCopy.wrapUp.outcome.title,
      callSessionCopy.wrapUp.afterCall.title,
      callSessionCopy.jobDetail.openCallSessionCta,
    ];

    requiredStrings.forEach((value) => {
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    });
  });
});
