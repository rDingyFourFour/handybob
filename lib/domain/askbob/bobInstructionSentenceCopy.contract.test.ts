import { describe, expect, it } from "vitest";

import { bobInstructionSentenceCopy, bobInstructionStates } from "@/lib/domain/askbob/bobInstructionSentenceCopy";

describe("bobInstructionSentenceCopy contract", () => {
  it("covers every known instruction state", () => {
    bobInstructionStates.forEach((state) => {
      expect(bobInstructionSentenceCopy).toHaveProperty(state);
    });
  });

  it("matches the canonical sentence snapshot", () => {
    expect(bobInstructionSentenceCopy).toMatchInlineSnapshot(`
      {
        "call_recommended": "It’s time to call the customer about this job.",
        "completed": "This job is wrapped up.",
        "followup_draft_ready": "I drafted a brief follow-up and it’s ready to send.",
        "followup_due": "I’m keeping an eye on a job that needs a small nudge.",
        "idle": "Everything’s up to date. I’ll let you know if something changes.",
        "in_progress": "This job is underway. I’ll flag anything that needs your attention.",
        "schedule_needed": "This job needs to be scheduled.",
        "waiting_on_user": "I need a bit more information before I can move this forward.",
      }
    `);
  });
});
