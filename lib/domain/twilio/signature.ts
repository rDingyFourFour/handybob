import twilio from "twilio";

export const TWILIO_SIGNATURE_HEADER = "x-twilio-signature";

export type TwilioSignatureRejectionReason = "missing_token" | "missing_signature" | "invalid_signature";

export type TwilioSignatureVerificationResult = {
  valid: boolean;
  reason?: TwilioSignatureRejectionReason;
  detail?: string;
};

export function verifyTwilioSignature(
  signature: string | null,
  params: Record<string, string>,
  url: string,
): TwilioSignatureVerificationResult {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return { valid: false, reason: "missing_token" };
  }

  if (!signature) {
    return { valid: false, reason: "missing_signature" };
  }

  try {
    const isValid = twilio.validateRequest(authToken, signature, url, params);
    return { valid: isValid, reason: isValid ? undefined : "invalid_signature" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "validation error";
    return { valid: false, reason: "invalid_signature", detail };
  }
}

export function formDataToRecord(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !(key in params)) {
      params[key] = value;
    }
  });
  return params;
}
