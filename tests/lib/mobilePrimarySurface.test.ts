import { describe, expect, it } from "vitest";

import { getJobDetailsMobilePrimarySurfacePolicy } from "@/lib/domain/ui/mobilePrimarySurface";
import type { JobProgressStep } from "@/lib/domain/askbob/nextStep";

describe("mobile primary surface policy", () => {
  const baseStep: JobProgressStep = "diagnose";

  it("collapses AskBob summary and leaves the accordion closed on mobile", () => {
    const policy = getJobDetailsMobilePrimarySurfacePolicy({
      isMobile: true,
      defaultProgressStep: baseStep,
    });
    expect(policy.askBobSummaryCollapsedByDefault).toBe(true);
    expect(policy.progressAccordionDefaultOpenStepId).toBeNull();
    expect(policy.hideExecutionByDefault).toBe(true);
    expect(policy.hideScheduleByDefault).toBe(true);
    expect(policy.hideHistoryByDefault).toBe(true);
  });

  it("preserves the derived accordion default on desktop", () => {
    const policy = getJobDetailsMobilePrimarySurfacePolicy({
      isMobile: false,
      defaultProgressStep: baseStep,
    });
    expect(policy.progressAccordionDefaultOpenStepId).toBe(baseStep);
    expect(policy.hideExecutionByDefault).toBe(false);
    expect(policy.hideScheduleByDefault).toBe(false);
    expect(policy.hideHistoryByDefault).toBe(false);
    expect(policy.visibleSections).toEqual(
      expect.arrayContaining(["execution", "schedule", "history"]),
    );
  });
});
