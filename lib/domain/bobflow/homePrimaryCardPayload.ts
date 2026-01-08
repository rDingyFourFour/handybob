import type { BobFlowScenario } from "./bobFlowScenario";

export type HomePrimaryCardIntent = "internal" | "external";

export type HomePrimaryCardCtaIntent = "move_on" | "follow_up" | "review" | "open_job";

const VALID_CTA_INTENTS: HomePrimaryCardCtaIntent[] = [
  "move_on",
  "follow_up",
  "review",
  "open_job",
];

export type HomePrimaryCardPayload = {
  scenario: BobFlowScenario;
  title: string;
  subcopy?: string;
  customerLine?: string;
  ctaLabel?: string;
  href?: string;
  intent: HomePrimaryCardIntent;
  requiresUserIntervention: boolean;
  telemetryPayload: Record<string, unknown>;
  ctaIntent: HomePrimaryCardCtaIntent;
};

export const assertValidHomePayload = (payload: HomePrimaryCardPayload): void => {
  const placeholderPattern = /\b(TODO|TBD)\b/i;
  if (!payload.scenario) {
    throw new Error("Payload scenario must be defined");
  }
  if (!payload.title?.trim()) {
    throw new Error("Payload title must be non-empty");
  }
  if (payload.subcopy !== undefined && !payload.subcopy?.trim()) {
    throw new Error("Payload subcopy, if provided, must be non-empty");
  }
  if (payload.ctaLabel !== undefined) {
    if (!payload.ctaLabel.trim()) {
      throw new Error("CTA label must be non-empty");
    }
    if (placeholderPattern.test(payload.ctaLabel)) {
      throw new Error("CTA label must not be a placeholder value");
    }
  }
  if (payload.intent === "internal" && !payload.scenario.startsWith("Internal.")) {
    throw new Error("Intent must match scenario namespace");
  }
  if (payload.intent === "external" && !payload.scenario.startsWith("External.")) {
    throw new Error("Intent must match scenario namespace");
  }
  if (payload.requiresUserIntervention !== payload.scenario.startsWith("External.")) {
    throw new Error("requiresUserIntervention must match scenario intent");
  }
  if (payload.ctaIntent === undefined || !VALID_CTA_INTENTS.includes(payload.ctaIntent)) {
    throw new Error("CTA intent must be a recognized value");
  }
  if (payload.customerLine !== undefined && !payload.customerLine?.trim()) {
    throw new Error("customerLine, if provided, must be non-empty");
  }
  if (payload.href !== undefined && !payload.href.startsWith("/m/")) {
    throw new Error("CTA href must start with /m/");
  }
  if (payload.telemetryPayload === null || typeof payload.telemetryPayload !== "object") {
    throw new Error("telemetryPayload must be an object");
  }
};
