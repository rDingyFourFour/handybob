import { describe, expect, it } from "vitest";

import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";
import { callSessionInstructionCopy } from "@/lib/ui/copy/callSessionInstructionCopy";
import { type CallSessionPrimaryCtaReasonCode } from "@/lib/domain/calls/sessions";

const CTA_REASON_CODES: CallSessionPrimaryCtaReasonCode[] = [
  "start_automated_call",
  "start_guided_call",
  "select_call_mode",
  "ready",
  "not_terminal",
  "missing_outcome",
  "missing_reached_flag",
  "missing_call_context",
  "missing_followup_context",
  "missing_job_link",
  "draft_ready",
  "draft_missing_body",
  "draft_missing_job",
  "no_call_session",
];

const REQUIRED_STRINGS = [
  callSessionCopy.header.title,
  callSessionCopy.header.subtitleTemplate,
  callSessionCopy.header.subtitleFallback,
  callSessionCopy.mode.title,
  callSessionCopy.mode.helper,
  callSessionCopy.mode.automated.label,
  callSessionCopy.mode.automated.description,
  callSessionCopy.mode.automated.helper,
  callSessionCopy.mode.manual.label,
  callSessionCopy.mode.manual.description,
  callSessionCopy.mode.manual.helper,
  callSessionCopy.statusStrip.labels.created,
  callSessionCopy.statusStrip.labels.status,
  callSessionCopy.statusStrip.labels.terminal,
  callSessionCopy.statusStrip.statuses.inProgress,
  callSessionCopy.statusStrip.statuses.terminal,
  callSessionCopy.secondaryActions.openJob,
  callSessionCopy.secondaryActions.openCalls,
  callSessionCopy.secondaryActions.openMessages,
  callSessionCopy.manualTools.title,
  callSessionCopy.manualTools.helper,
  callSessionCopy.wrapUp.title,
  callSessionCopy.wrapUp.helper,
  callSessionCopy.wrapUp.outcome.title,
  callSessionCopy.wrapUp.outcome.helper,
  callSessionCopy.wrapUp.afterCall.title,
  callSessionCopy.wrapUp.afterCall.helper,
  callSessionCopy.wrapUp.afterCall.openComposer,
  callSessionCopy.disabled.missingPhone,
  callSessionCopy.disabled.missingScript,
  callSessionCopy.disabled.notReady,
  callSessionCopy.disabled.safeFailure,
];

describe("callSessionCopy", () => {
  it("defines required copy keys", () => {
    REQUIRED_STRINGS.forEach((value) => {
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    });
  });

});

describe("callSessionInstructionCopy", () => {
  it("defines CTA labels", () => {
    Object.values(callSessionInstructionCopy.primaryCta.label).forEach((labelText) => {
      expect(typeof labelText).toBe("string");
      expect(labelText.trim().length).toBeGreaterThan(0);
    });
  });

  it("covers CTA reason codes with explanations", () => {
    CTA_REASON_CODES.forEach((reasonCode) => {
      const explanation = callSessionInstructionCopy.primaryCta.explanation[reasonCode];
      expect(typeof explanation).toBe("string");
      expect(explanation.trim().length).toBeGreaterThan(0);
    });
  });
});
