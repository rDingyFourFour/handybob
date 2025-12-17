export const ASKBOB_AUTOMATED_VOICE_DEFAULT = "alloy";
export const ASKBOB_AUTOMATED_GREETING_STYLE_DEFAULT = "Professional";
export const SPEECH_PLAN_METADATA_MARKER = "\n--- speech plan ---\n";

export type AskBobSpeechPlanInput = {
  voice: string;
  greetingStyle: string;
  allowVoicemail: boolean;
  scriptSummary?: string | null;
};
