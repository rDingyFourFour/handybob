export const ASKBOB_AUTOMATED_CALL_SCRIPT_PREVIEW_LIMIT = 360;

export const ASKBOB_AUTOMATED_CALL_VOICE_OPTIONS = [
  { value: "alloy", label: "Alloy (neutral)" },
  { value: "samantha", label: "Samantha (friendly)" },
  { value: "david", label: "David (calm)" },
];

const VOICE_LABEL_LOOKUP = new Map(ASKBOB_AUTOMATED_CALL_VOICE_OPTIONS.map((option) => [option.value, option.label]));

export function getAutomatedCallVoiceLabel(voice?: string | null): string | null {
  if (!voice) {
    return null;
  }
  return VOICE_LABEL_LOOKUP.get(voice) ?? null;
}
