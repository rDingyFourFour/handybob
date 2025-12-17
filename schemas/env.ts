export type EnvConfig = {
  appUrl: string | null;
  twilioAccountSid: string | null;
  twilioAuthToken: string | null;
  twilioMachineDetectionEnabled: boolean;
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  openAiModel: string;
};

function trimOrNull(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function parseBooleanFlag(value: string | undefined | null) {
  const normalized = trimOrNull(value);
  if (!normalized) {
    return false;
  }
  return normalized.toLowerCase() === "true" || normalized === "1";
}

export function parseEnvConfig(env: NodeJS.ProcessEnv = process.env): EnvConfig {
  return {
    appUrl: trimOrNull(env.NEXT_PUBLIC_APP_URL),
    twilioAccountSid: trimOrNull(env.TWILIO_ACCOUNT_SID),
    twilioAuthToken: trimOrNull(env.TWILIO_AUTH_TOKEN),
    twilioMachineDetectionEnabled: parseBooleanFlag(env.TWILIO_MACHINE_DETECTION_ENABLED),
    stripeSecretKey: trimOrNull(env.STRIPE_SECRET_KEY),
    stripeWebhookSecret: trimOrNull(env.STRIPE_WEBHOOK_SECRET),
    openAiModel: trimOrNull(env.OPENAI_MODEL) ?? "gpt-4.1-mini",
  };
}
