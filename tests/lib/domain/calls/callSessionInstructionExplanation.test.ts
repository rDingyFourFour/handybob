import { describe, expect, it } from "vitest";

import { deriveCallSessionInstruction } from "@/lib/domain/calls/callSessionInstruction";
import type { CallSessionPrimaryCtaReasonCode } from "@/lib/domain/calls/sessions";
import type { PrimaryCtaKind } from "@/app/(app)/calls/[id]/callSessionTypes";
import { callSessionInstructionCopy } from "@/lib/ui/copy/callSessionInstructionCopy";

const CTA_KIND_BY_REASON: Record<CallSessionPrimaryCtaReasonCode, PrimaryCtaKind> = {
  start_automated_call: "start-automated-call",
  start_guided_call: "start-guided-call",
  select_call_mode: "disabled",
  ready: "generate-followup",
  not_terminal: "refresh-status",
  missing_outcome: "capture-outcome",
  missing_reached_flag: "capture-outcome",
  missing_call_context: "start-automated-call",
  missing_followup_context: "generate-followup",
  missing_job_link: "generate-followup",
  draft_ready: "open-composer",
  draft_missing_body: "open-composer",
  draft_missing_job: "open-composer",
  no_call_session: "generate-followup",
};

const baseInput = {
  workspaceId: "workspace-1",
  callId: "call-1",
  jobId: "job-1",
  customerId: "customer-1",
};

describe("call session instruction explanations", () => {
  const cases: Array<{
    code: CallSessionPrimaryCtaReasonCode;
    kind: PrimaryCtaKind;
  }> = Object.entries(CTA_KIND_BY_REASON).map(([code, kind]) => ({
    code: code as CallSessionPrimaryCtaReasonCode,
    kind,
  }));

  it.each(cases)("maps %s to the stable explanation", ({ code, kind }) => {
    const instruction = deriveCallSessionInstruction({
      ...baseInput,
      mode: "automated",
      primaryCta: { kind, disabled: code === "select_call_mode" },
      ctaReasonCode: code,
    });
    expect(instruction.recommendation).toBe(
      callSessionInstructionCopy.primaryCta.explanation[code],
    );
  });
});
