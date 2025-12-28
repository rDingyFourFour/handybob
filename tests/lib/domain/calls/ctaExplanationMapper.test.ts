import { describe, expect, it } from "vitest";

import {
  mapCtaReasonCodeToExplanation,
  type CallSessionPrimaryCtaReasonCode,
} from "@/lib/domain/calls/sessions";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";

describe("mapCtaReasonCodeToExplanation", () => {
  const cases: Array<{
    code: CallSessionPrimaryCtaReasonCode;
    ctaKind?: string;
    expected: string;
  }> = [
    {
      code: "start_automated_call",
      ctaKind: "start-automated-call",
      expected: callSessionCopy.primaryCta.explanation.start_automated_call,
    },
    {
      code: "start_guided_call",
      ctaKind: "start-guided-call",
      expected: callSessionCopy.primaryCta.explanation.start_guided_call,
    },
    {
      code: "select_call_mode",
      ctaKind: "disabled",
      expected: callSessionCopy.primaryCta.explanation.select_call_mode,
    },
    {
      code: "ready",
      ctaKind: "generate-followup",
      expected: callSessionCopy.primaryCta.explanation.ready,
    },
    {
      code: "not_terminal",
      ctaKind: "refresh-status",
      expected: callSessionCopy.primaryCta.explanation.not_terminal,
    },
    {
      code: "missing_outcome",
      ctaKind: "capture-outcome",
      expected: callSessionCopy.primaryCta.explanation.missing_outcome,
    },
    {
      code: "missing_reached_flag",
      ctaKind: "capture-outcome",
      expected: callSessionCopy.primaryCta.explanation.missing_reached_flag,
    },
    {
      code: "missing_call_context",
      ctaKind: "start-automated-call",
      expected: callSessionCopy.primaryCta.explanation.missing_call_context,
    },
    {
      code: "missing_followup_context",
      ctaKind: "generate-followup",
      expected: callSessionCopy.primaryCta.explanation.missing_followup_context,
    },
    {
      code: "missing_job_link",
      ctaKind: "generate-followup",
      expected: callSessionCopy.primaryCta.explanation.missing_job_link,
    },
    {
      code: "draft_ready",
      ctaKind: "open-composer",
      expected: callSessionCopy.primaryCta.explanation.draft_ready,
    },
    {
      code: "draft_missing_body",
      ctaKind: "open-composer",
      expected: callSessionCopy.primaryCta.explanation.draft_missing_body,
    },
    {
      code: "draft_missing_job",
      ctaKind: "open-composer",
      expected: callSessionCopy.primaryCta.explanation.draft_missing_job,
    },
    {
      code: "no_call_session",
      ctaKind: "generate-followup",
      expected: callSessionCopy.primaryCta.explanation.no_call_session,
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
        case "start_guided_call":
        case "select_call_mode":
        case "ready":
        case "not_terminal":
        case "missing_outcome":
        case "missing_reached_flag":
        case "missing_call_context":
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
