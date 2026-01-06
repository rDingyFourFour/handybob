import { assertBobTone } from "@/lib/domain/copy/bobVoice";
import type { BobInstructionState } from "@/lib/domain/askbob/bobInstructionSentenceCopy";

export type HomeInstructionFirstCopyPayload = {
  instructionTitle: string;
  instructionSubcopy: string;
};

export type HomeInstructionFirstState = "followup_due" | "followup_draft_ready";

export const homeInstructionFirstCopy: Record<
  HomeInstructionFirstState,
  HomeInstructionFirstCopyPayload
> = {
  followup_due: {
    instructionTitle: "Follow up on the kitchen cabinet job",
    instructionSubcopy: "The customer hasn't confirmed timing yet.",
  },
  followup_draft_ready: {
    instructionTitle: "Follow up on the kitchen cabinet job",
    instructionSubcopy: "I recommend checking in with the customer today.",
  },
};

export function getHomeInstructionFirstCopy(
  state: BobInstructionState,
): HomeInstructionFirstCopyPayload | undefined {
  if (state !== "followup_due" && state !== "followup_draft_ready") {
    return undefined;
  }
  return homeInstructionFirstCopy[state];
}

export function validateHomeInstructionFirstCopy(): void {
  const entries = Object.entries(homeInstructionFirstCopy) as Array<
    [HomeInstructionFirstState, HomeInstructionFirstCopyPayload]
  >;
  for (const [state, payload] of entries) {
    assertBobTone(payload.instructionTitle, `homeInstructionFirstCopy.${state}.instructionTitle`);
    assertBobTone(payload.instructionSubcopy, `homeInstructionFirstCopy.${state}.instructionSubcopy`);
  }
}
