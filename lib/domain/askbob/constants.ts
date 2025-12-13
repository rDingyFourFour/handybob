export const ASKBOB_SCRIPT_PREFIX = "AskBob call script:";

export function parseAskBobCallScriptSummary(summary?: string | null): string | null {
  if (!summary) {
    return null;
  }
  const trimmed = summary.trim();
  if (!trimmed || !trimmed.startsWith(ASKBOB_SCRIPT_PREFIX)) {
    return null;
  }
  const scriptText = trimmed.slice(ASKBOB_SCRIPT_PREFIX.length).trim();
  return scriptText || null;
}

export function isAskBobScriptSummary(summary?: string | null) {
  return Boolean(parseAskBobCallScriptSummary(summary));
}

export function getAskBobCallScriptSource(
  aiSummary?: string | null,
  summary?: string | null,
): string | null {
  return aiSummary?.trim() || summary?.trim() || null;
}

export function getAskBobCallScriptBody(
  aiSummary?: string | null,
  summary?: string | null,
): string | null {
  const source = getAskBobCallScriptSource(aiSummary, summary);
  return parseAskBobCallScriptSummary(source);
}
