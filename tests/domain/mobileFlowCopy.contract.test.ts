import { describe, expect, it } from "vitest";

import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";
import { mobileHomeCopy } from "@/lib/domain/mobile/mobileHomeCopy";

describe("mobile flow copy contract", () => {
  it("re-exports the canonical home copy map", () => {
    expect(mobileFlowCopy.home).toBe(mobileHomeCopy);
  });

  it("exposes the expected keys and values", () => {
    expect(mobileFlowCopy).toMatchInlineSnapshot(`
      {
        "activeJob": {
          "calmReassurance": "Everything looks on track for this job.",
          "instructionFallback": "Everything looks on track for this job.",
          "nextStepHeading": "Bob's next step",
          "nextStepHelper": "Focus on this step to keep the job moving forward.",
          "notFoundAction": "Back to home",
          "notFoundBody": "We couldn’t find that job right now. Return to Home to continue.",
          "notFoundTitle": "Job not found",
          "viewJobDetails": "View job details",
        },
        "followupPlaceholder": {
          "backButton": "Back to active job",
          "description": "AskBob is preparing a follow-up for this job. We'll show it here soon.",
          "title": "Follow-up draft",
        },
        "home": {
          "greetingFallback": "Good morning",
          "greetingTemplate": "Good morning, {name}",
          "idleReassurance": "Everything else is up to date. I'll let you know if something changes.",
          "recommendationCtaLabel": "Review Job",
          "recommendationLabel": "Next step",
          "recommendationTitleFallback": "Untitled job",
          "title": "HandyBob",
        },
      }
    `);
  });
});
