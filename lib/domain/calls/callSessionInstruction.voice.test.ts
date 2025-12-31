import { assertBobTone } from "@/lib/domain/copy/bobVoice";
import { deriveCallSessionInstruction } from "@/lib/domain/calls/callSessionInstruction";

const baseInput = {
  workspaceId: "workspace-1",
  callId: "call-1",
  jobId: "job-1",
  customerId: "customer-1",
};

const scenarios = [
  {
    name: "unselected mode",
    input: {
      mode: "unselected" as const,
      primaryCta: { kind: "disabled", disabled: true },
      ctaReasonCode: "select_call_mode" as const,
    },
  },
  {
    name: "missing call context",
    input: {
      mode: "automated" as const,
      primaryCta: { kind: "start-automated-call", disabled: true },
      ctaReasonCode: "missing_call_context" as const,
    },
  },
  {
    name: "refresh in progress",
    input: {
      mode: "automated" as const,
      primaryCta: { kind: "refresh-status" },
      ctaReasonCode: "not_terminal" as const,
    },
  },
  {
    name: "capture outcome",
    input: {
      mode: "manual" as const,
      primaryCta: { kind: "capture-outcome" },
      ctaReasonCode: "missing_outcome" as const,
    },
  },
  {
    name: "open composer",
    input: {
      mode: "manual" as const,
      primaryCta: { kind: "open-composer", workspaceNavigate: { tab: "after", hash: "#askbob-after-call" } },
      ctaReasonCode: "draft_ready" as const,
    },
  },
];

describe("call session instruction Bob voice", () => {
  scenarios.forEach((scenario) => {
    it(`keeps the ${scenario.name} copy Bob tone`, () => {
      const instruction = deriveCallSessionInstruction({
        ...baseInput,
        ...scenario.input,
      });
      assertBobTone(instruction.statement, "instruction.statement");
      assertBobTone(instruction.recommendation, "instruction.recommendation");
      if (instruction.primaryCta?.label) {
        assertBobTone(instruction.primaryCta.label, "instruction.primaryCta.label");
      }
    });
  });
});
