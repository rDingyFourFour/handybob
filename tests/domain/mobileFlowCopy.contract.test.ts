import { describe, expect, it } from "vitest";

import { mobileFlowCopy } from "@/lib/ui/copy/mobileFlowCopy";

describe("mobile flow copy contract", () => {
  it("exposes the expected keys and values", () => {
    expect(mobileFlowCopy).toMatchInlineSnapshot(`
      {
        "activeJob": {
          "calmReassurance": "Everything looks on track for this job.",
          "nextStepHeading": "Bob's next step",
          "nextStepHelper": "Focus on this step to keep the job moving forward.",
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
          "idleReassurance": "Everything's up to date. I'll let you know if anything changes.",
          "recommendationCtaLabel": "Review job",
          "recommendationLabel": "Next step",
          "recommendationTitleFallback": "Untitled job",
          "statement": "I'm tracking the job that needs a small nudge.",
          "title": "Home",
        },
      }
    `);
  });
});
