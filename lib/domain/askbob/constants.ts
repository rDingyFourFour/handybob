export const ASKBOB_SCRIPT_PREFIX = "AskBob call script:";

export function isAskBobScriptSummary(summary?: string | null) {
  if (!summary) {
    return false;
  }
  const trimmed = summary.trim();
  if (!trimmed.length) {
    return false;
  }
  return trimmed.startsWith(ASKBOB_SCRIPT_PREFIX);
}
