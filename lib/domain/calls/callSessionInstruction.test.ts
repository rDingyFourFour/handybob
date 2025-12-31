import { describe, expect, it } from "vitest";

import { deriveCallSessionInstruction } from "@/lib/domain/calls/callSessionInstruction";
import { callSessionInstructionCopy } from "@/lib/ui/copy/callSessionInstructionCopy";

const baseInput = {
  workspaceId: "workspace-1",
  callId: "call-1",
  jobId: "job-1",
  customerId: "customer-1",
};

describe("deriveCallSessionInstruction", () => {
  it("recommends picking a mode when unselected", () => {
    const instruction = deriveCallSessionInstruction({
      ...baseInput,
      mode: "unselected",
      primaryCta: { kind: "disabled", disabled: true },
      ctaReasonCode: "select_call_mode",
    });
    expect(instruction.primaryCta?.label).toBe(
      callSessionInstructionCopy.primaryCta.label.disabled,
    );
    expect(instruction.recommendation).toBe(
      callSessionInstructionCopy.primaryCta.explanation.select_call_mode,
    );
    expect(instruction.telemetry.mode).toBe("unselected");
    expect(instruction.telemetry.reasonCode).toBe("select_call_mode");
  });

  it("explains missing phone or script in automated mode", () => {
    const instruction = deriveCallSessionInstruction({
      ...baseInput,
      mode: "automated",
      primaryCta: { kind: "start-automated-call", disabled: true },
      ctaReasonCode: "missing_call_context",
    });
    expect(instruction.primaryCta?.label).toBe(
      callSessionInstructionCopy.primaryCta.label.startAutomated,
    );
    expect(instruction.recommendation).toBe(
      callSessionInstructionCopy.primaryCta.explanation.missing_call_context,
    );
    expect(instruction.telemetry.mode).toBe("automated");
    expect(instruction.telemetry.hasPrimaryCta).toBe(false);
  });

  it("refreshes status when the dial is in progress", () => {
    const instruction = deriveCallSessionInstruction({
      ...baseInput,
      mode: "automated",
      primaryCta: { kind: "refresh-status" },
      ctaReasonCode: "not_terminal",
    });
    expect(instruction.primaryCta?.label).toBe(
      callSessionInstructionCopy.primaryCta.label.refreshStatus,
    );
    expect(instruction.recommendation).toBe(
      callSessionInstructionCopy.primaryCta.explanation.not_terminal,
    );
    expect(instruction.telemetry.reasonCode).toBe("not_terminal");
  });

  it("requests an outcome when the call is terminal and missing context", () => {
    const instruction = deriveCallSessionInstruction({
      ...baseInput,
      mode: "manual",
      primaryCta: { kind: "capture-outcome", workspaceNavigate: { tab: "after", hash: "#call-outcome-capture" } },
      ctaReasonCode: "missing_outcome",
    });
    expect(instruction.primaryCta?.label).toBe(
      callSessionInstructionCopy.primaryCta.label.captureOutcome,
    );
    expect(instruction.recommendation).toBe(
      callSessionInstructionCopy.primaryCta.explanation.missing_outcome,
    );
    expect(instruction.telemetry.reasonCode).toBe("missing_outcome");
    expect(instruction.telemetry.mode).toBe("manual");
  });

  it("invites the user to review the follow-up draft when ready", () => {
    const instruction = deriveCallSessionInstruction({
      ...baseInput,
      mode: "manual",
      primaryCta: {
        kind: "open-composer",
        workspaceNavigate: { tab: "after", hash: "#askbob-after-call" },
        disabled: false,
      },
      ctaReasonCode: "draft_ready",
    });
    expect(instruction.primaryCta?.label).toBe(
      callSessionInstructionCopy.primaryCta.label.openComposer,
    );
    expect(instruction.recommendation).toBe(
      callSessionInstructionCopy.primaryCta.explanation.draft_ready,
    );
    expect(instruction.telemetry.reasonCode).toBe("draft_ready");
  });
});
