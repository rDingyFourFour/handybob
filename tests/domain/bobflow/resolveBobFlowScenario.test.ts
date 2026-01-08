import { describe, expect, it } from "vitest";

import type { HomeInstruction } from "@/lib/domain/askbob/homeInstruction";
import { homeInstructionFirstCopy } from "@/lib/domain/mobile/homeInstructionCopy";
import { resolveBobFlowScenario } from "@/lib/domain/bobflow/resolveBobFlowScenario";

const createHomeInstruction = (overrides: Partial<HomeInstruction> = {}): HomeInstruction => {
  const baseStep = overrides.instruction?.stepType ?? "diagnose";
  const baseTelemetry = {
    stepType: baseStep,
    hasPrimaryCta: true,
    isIdle: false,
  };
  const baseInstruction = {
    statement: "Test statement",
    recommendation: "Test recommendation",
    rationale: null,
    stepType: baseStep,
    primaryCta: {
      label: "Take action",
      actionType: "navigate",
    },
    telemetry: baseTelemetry,
  };
  const mergedInstruction = {
    ...baseInstruction,
    ...overrides.instruction,
    telemetry: {
      ...baseTelemetry,
      ...(overrides.instruction?.telemetry ?? {}),
    },
  };
  return {
    jobId: overrides.jobId ?? "job-test",
    title: overrides.title ?? "Test job",
    instruction: mergedInstruction,
    instructionCopy: overrides.instructionCopy,
    customerName: overrides.customerName ?? null,
    followupSnapshot: overrides.followupSnapshot ?? null,
  };
};

describe("resolveBobFlowScenario", () => {
  it("keeps the internal work scenario when no follow-up artifact is present", () => {
    const homeInstruction = createHomeInstruction();

    const result = resolveBobFlowScenario({
      homeInstruction,
      hasRecommendation: true,
    });

    expect(result).toBe("Internal.msg");
  });

  it("advances to the follow-up schedule scenario once the artifact exists", () => {
    const homeInstruction = createHomeInstruction({
      instruction: {
        stepType: "followup",
        telemetry: {
          stepType: "followup",
          hasPrimaryCta: true,
          isIdle: false,
        },
      },
      instructionCopy: homeInstructionFirstCopy.followup_draft_ready,
    });

    const result = resolveBobFlowScenario({
      homeInstruction,
      hasRecommendation: true,
    });

    expect(result).toBe("External.msg.followup.schedule");
  });

  it("derives the message follow-up scenario when the snapshot recommends a message", () => {
    const homeInstruction = createHomeInstruction({
      instruction: {
        stepType: "followup",
        telemetry: {
          stepType: "followup",
          hasPrimaryCta: true,
          isIdle: false,
        },
      },
      followupSnapshot: {
        recommendedAction: "Check in via message",
        rationale: "Customer asked for words",
        steps: [{ label: "message" }],
        shouldSendMessage: true,
        shouldCall: false,
        shouldScheduleVisit: false,
        shouldWait: false,
        modelLatencyMs: 1,
      },
    });

    const result = resolveBobFlowScenario({
      homeInstruction,
      hasRecommendation: true,
    });
    expect(result).toBe("External.msg.followup.quote");
  });

  it("derives the call follow-up scenario when the snapshot recommends a call", () => {
    const homeInstruction = createHomeInstruction({
      instruction: {
        stepType: "followup",
        telemetry: {
          stepType: "followup",
          hasPrimaryCta: true,
          isIdle: false,
        },
      },
      followupSnapshot: {
        recommendedAction: "Call customer",
        rationale: "Calls needed",
        steps: [{ label: "call" }],
        shouldSendMessage: false,
        shouldCall: true,
        shouldScheduleVisit: false,
        shouldWait: false,
        modelLatencyMs: 1,
      },
    });

    const result = resolveBobFlowScenario({
      homeInstruction,
      hasRecommendation: true,
    });
    expect(result).toBe("External.calls.followup.quote");
  });
});
