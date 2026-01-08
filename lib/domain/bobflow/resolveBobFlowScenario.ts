import type { HomeInstruction } from "@/lib/domain/askbob/homeInstruction";
import { homeInstructionFirstCopy } from "@/lib/domain/mobile/homeInstructionCopy";
import { deriveNextScenarioFromFollowupSnapshot } from "@/lib/domain/bobflow/deriveNextScenarioFromFollowupSnapshot";

export type ResolveBobFlowScenarioArgs = {
  homeInstruction: HomeInstruction | null;
  hasRecommendation: boolean;
};

export type ResolveBobFlowScenarioResult =
  | "Idle"
  | "Internal.msg"
  | "External.msg.followup.schedule"
  | "External.msg.followup.quote"
  | "External.calls.followup.quote";

export const resolveBobFlowScenario = ({
  homeInstruction,
  hasRecommendation,
}: ResolveBobFlowScenarioArgs): ResolveBobFlowScenarioResult => {
  if (!hasRecommendation || !homeInstruction) {
    return "Idle";
  }

  const isFollowupStep = homeInstruction.instruction.stepType === "followup";
  const hasFollowupDraftReadyCopy =
    homeInstruction.instructionCopy === homeInstructionFirstCopy.followup_draft_ready;
  const showFollowupIssueTitle = isFollowupStep && !hasFollowupDraftReadyCopy;

  if (isFollowupStep) {
    const derivedScenario = deriveNextScenarioFromFollowupSnapshot(homeInstruction.followupSnapshot);
    if (derivedScenario) {
      return derivedScenario;
    }
  }

  if (hasFollowupDraftReadyCopy) {
    return "External.msg.followup.schedule";
  }

  if (showFollowupIssueTitle) {
    return "External.msg.followup.schedule";
  }

  return "Internal.msg";
};
