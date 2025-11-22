export type EnvConfig = {
  appUrl: string | null;
  twilioAccountSid: string | null;
  twilioAuthToken: string | null;
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  openAiModel: string;
};

function trimOrNull(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function parseEnvConfig(env: NodeJS.ProcessEnv = process.env): EnvConfig {
  return {
    appUrl: trimOrNull(env.NEXT_PUBLIC_APP_URL),
    twilioAccountSid: trimOrNull(env.TWILIO_ACCOUNT_SID),
    twilioAuthToken: trimOrNull(env.TWILIO_AUTH_TOKEN),
    stripeSecretKey: trimOrNull(env.STRIPE_SECRET_KEY),
    stripeWebhookSecret: trimOrNull(env.STRIPE_WEBHOOK_SECRET),
    openAiModel: trimOrNull(env.OPENAI_MODEL) ?? "gpt-4.1-mini",
  };
}
