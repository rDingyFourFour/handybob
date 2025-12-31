import { assertBobTone } from "@/lib/domain/copy/bobVoice";

export const callSessionInstructionCopy = {
  statement: "Let's keep this call moving.",
  primaryCta: {
    label: {
      startAutomated: "Start automated call",
      startGuided: "Start guided call",
      refreshStatus: "Refresh call status",
      captureOutcome: "Record outcome",
      generateFollowup: "Go to wrap-up",
      openComposer: "Review follow-up draft",
      disabled: "Choose a call mode",
      loadingAutomated: "Starting call...",
    },
    explanation: {
      start_automated_call: "AskBob is ready to place the call.",
      start_guided_call: "You're ready to place the call with guidance.",
      select_call_mode: "Choose Automated or Guided to continue.",
      ready: "Wrap-up is ready.",
      not_terminal: "Call is still running. Wrap-up unlocks when it ends.",
      missing_outcome: "Record the outcome to unlock the follow-up.",
      missing_reached_flag: "Confirm whether the customer was reached.",
      missing_call_context: "Add a script and customer phone number to start.",
      missing_followup_context: "Add outcome notes or a call summary to generate a follow-up.",
      missing_job_link: "Link a job to continue.",
      draft_ready: "Draft is ready to review and send.",
      draft_missing_body: "Draft is still generating.",
      draft_missing_job: "Link a job to open the composer.",
      no_call_session: "Call session data is missing. Refresh the page.",
      fallback: "Check the call details to continue.",
    },
  },
} as const;

export function validateCallSessionInstructionCopy(): void {
  const check = (value: string, label: string) => assertBobTone(value, label);
  check(callSessionInstructionCopy.statement, "statement");
  Object.entries(callSessionInstructionCopy.primaryCta.label).forEach(([labelKey, labelText]) => {
    check(labelText, `primaryCta.label.${labelKey}`);
  });
  Object.entries(callSessionInstructionCopy.primaryCta.explanation).forEach(([key, value]) => {
    check(value, `primaryCta.explanation.${key}`);
  });
}
