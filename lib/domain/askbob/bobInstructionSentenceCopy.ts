import { assertBobTone } from "@/lib/domain/copy/bobVoice";

export type BobInstructionState =
  | "idle"
  | "followup_due"
  | "followup_draft_ready"
  | "call_recommended"
  | "schedule_needed"
  | "in_progress"
  | "waiting_on_user"
  | "completed";

export const bobInstructionStates: BobInstructionState[] = [
  "idle",
  "followup_due",
  "followup_draft_ready",
  "call_recommended",
  "schedule_needed",
  "in_progress",
  "waiting_on_user",
  "completed",
];

export const bobInstructionSentenceCopy: Record<BobInstructionState, string> = {
  idle: "Everything’s up to date. I’ll let you know if something changes.",
  followup_due: "I’m keeping an eye on a job that needs a small nudge.",
  followup_draft_ready: "I drafted a brief follow-up and it’s ready to send.",
  call_recommended: "It’s time to call the customer about this job.",
  schedule_needed: "This job needs to be scheduled.",
  in_progress: "This job is underway. I’ll flag anything that needs your attention.",
  waiting_on_user: "I need a bit more information before I can move this forward.",
  completed: "This job is wrapped up.",
};

export function getBobInstructionSentence(state: BobInstructionState): string {
  const sentence = bobInstructionSentenceCopy[state];
  if (sentence) {
    return sentence;
  }
  // Fallback to `idle` for safety when the state is ever undefined; the statement shouldn’t crash UI.
  return bobInstructionSentenceCopy.idle;
}

export function validateBobInstructionSentenceCopy(): void {
  for (const state of bobInstructionStates) {
    assertBobTone(bobInstructionSentenceCopy[state], `bobInstructionSentenceCopy.${state}`);
  }
}
