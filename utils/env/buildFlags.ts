// Temporary build-diagnostic kill switches; flip them on to stub feature slices while we binary-search Vercel build hangs.
type FlagName =
  | "DISABLE_CALLS_FEATURE_FOR_BUILD"
  | "DISABLE_PUBLIC_BOOKING_FOR_BUILD"
  | "DISABLE_AI_FOR_BUILD";

const ENABLED_VALUES = new Set(["true", "1"]);

function readFlag(name: FlagName): boolean {
  const rawValue = String(process.env[name] ?? "").toLowerCase();
  return ENABLED_VALUES.has(rawValue);
}

export const isProductionBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build";

function shouldActivateFlag(name: FlagName) {
  return isProductionBuildPhase && readFlag(name);
}

export const DISABLE_CALLS_FEATURE_FOR_BUILD = shouldActivateFlag("DISABLE_CALLS_FEATURE_FOR_BUILD");
export const DISABLE_PUBLIC_BOOKING_FOR_BUILD =
  shouldActivateFlag("DISABLE_PUBLIC_BOOKING_FOR_BUILD");
export const DISABLE_AI_FOR_BUILD = shouldActivateFlag("DISABLE_AI_FOR_BUILD");
