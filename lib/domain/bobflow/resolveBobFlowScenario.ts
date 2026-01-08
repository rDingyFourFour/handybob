import type { HomeInstruction } from "@/lib/domain/askbob/homeInstruction";
import { homeInstructionFirstCopy } from "@/lib/domain/mobile/homeInstructionCopy";

export type ResolveBobFlowScenarioArgs = {
  homeInstruction: HomeInstruction | null;
  hasRecommendation: boolean;
};

export type ResolveBobFlowScenarioResult = "Idle" | "Internal.msg" | "External.msg.followup.schedule";

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

  if (showFollowupIssueTitle) {
    return "External.msg.followup.schedule";
  }

  return "Internal.msg";
};
