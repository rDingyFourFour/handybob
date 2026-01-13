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
        "followupDraft": {
          "backButton": "Back to active job",
          "description": "AskBob drafted a follow-up message for this job. Review the suggested text below before sending it.",
          "messageHeading": "Suggested message",
          "stepsFallback": "AskBob recommends covering the customer's next steps in your message.",
          "stepsHeading": "Next steps",
          "title": "Follow-up draft",
        },
        "followupPlaceholder": {
          "backButton": "Back to active job",
          "description": "AskBob is preparing a follow-up for this job. We'll show it here soon.",
          "retryButton": "Retry draft",
          "retryDescription": "AskBob had trouble preparing the draft. Tap Back and try again, or reload.",
          "title": "Follow-up draft",
        },
        "home": {
          "greetingFallback": "Good morning",
          "greetingTemplate": "Good morning, {name}",
          "idleReassurance": "Everything else is up to date. I'll let you know if something changes.",
          "recommendationCtaLabel": "Send follow-up",
          "recommendationLabel": "Next step",
          "recommendationTitleFallback": "Untitled job",
          "title": "HandyBob",
        },
      }
    `);
  });

  it("keeps placeholder and draft descriptions distinct", () => {
    const placeholderDescription = mobileFlowCopy.followupPlaceholder.description;
    const draftDescription = mobileFlowCopy.followupDraft.description;
    expect(placeholderDescription).not.toBe("");
    expect(draftDescription).not.toBe("");
    expect(placeholderDescription).not.toBe(draftDescription);
  });
});
