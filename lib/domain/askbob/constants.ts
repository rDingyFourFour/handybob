export const ASKBOB_SCRIPT_PREFIX = "AskBob call script:";
export const ASKBOB_AUTOMATED_SCRIPT_PREFIX = "AskBob automated call script:";
const ASKBOB_SCRIPT_SUMMARY_PREFIXES = [ASKBOB_SCRIPT_PREFIX, ASKBOB_AUTOMATED_SCRIPT_PREFIX];

export function parseAskBobCallScriptSummary(summary?: string | null): string | null {
  if (!summary) {
    return null;
  }
  const trimmed = summary.trim();
  if (!trimmed) {
    return null;
  }
  for (const prefix of ASKBOB_SCRIPT_SUMMARY_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      const scriptText = trimmed.slice(prefix.length).trim();
      return scriptText || null;
    }
  }
  return null;
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
