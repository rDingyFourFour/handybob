import { describe, expect, it } from "vitest";

import {
  mapCtaReasonCodeToExplanation,
  type CallSessionPrimaryCtaReasonCode,
} from "@/lib/domain/calls/sessions";

describe("mapCtaReasonCodeToExplanation", () => {
  const cases: Array<{
    code: CallSessionPrimaryCtaReasonCode;
    ctaKind?: string;
    expected: string;
  }> = [
    {
      code: "start_automated_call",
      ctaKind: "start-automated-call",
      expected: "Ready to open the automated call panel.",
    },
    {
      code: "ready",
      ctaKind: "generate-followup",
      expected: "Ready to generate follow-up.",
    },
    {
      code: "not_terminal",
      ctaKind: "refresh-status",
      expected: "Call in progress. We'll unlock next steps when it finishes.",
    },
    {
      code: "missing_outcome",
      ctaKind: "capture-outcome",
      expected: "Outcome required. Save the outcome to unlock follow-up.",
    },
    {
      code: "missing_reached_flag",
      ctaKind: "capture-outcome",
      expected: "Reach status required. Confirm whether the customer was reached.",
    },
    {
      code: "missing_followup_context",
      ctaKind: "generate-followup",
      expected: "Add a call summary or outcome notes to generate follow-up.",
    },
    {
      code: "missing_job_link",
      ctaKind: "generate-followup",
      expected: "Link a job to continue.",
    },
    {
      code: "draft_ready",
      ctaKind: "open-composer",
      expected: "Draft ready. Open the composer to review and send.",
    },
    {
      code: "draft_missing_body",
      ctaKind: "open-composer",
      expected: "Draft still processing. Check back in a moment.",
    },
    {
      code: "draft_missing_job",
      ctaKind: "open-composer",
      expected: "Link a job to open the composer.",
    },
    {
      code: "no_call_session",
      ctaKind: "generate-followup",
      expected: "Call details are unavailable. Refresh to continue.",
    },
  ];

  it.each(cases)("maps $code to stable explanation", ({ code, ctaKind, expected }) => {
    expect(mapCtaReasonCodeToExplanation(code, ctaKind)).toBe(expected);
  });

  it("requires exhaustive handling of reason codes", () => {
    const assertNever = (value: never): never => value;
    const exhaustiveCheck = (value: CallSessionPrimaryCtaReasonCode): CallSessionPrimaryCtaReasonCode => {
      switch (value) {
        case "start_automated_call":
        case "ready":
        case "not_terminal":
        case "missing_outcome":
        case "missing_reached_flag":
        case "missing_followup_context":
        case "missing_job_link":
        case "draft_ready":
        case "draft_missing_body":
        case "draft_missing_job":
        case "no_call_session":
          return value;
        default:
          return assertNever(value);
      }
    };

    cases.forEach(({ code }) => {
      expect(exhaustiveCheck(code)).toBe(code);
    });
  });
});
