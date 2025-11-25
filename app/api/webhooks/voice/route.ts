import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

import { handleRecordingEvent, handleTwilioVoiceEvent } from "@/lib/domain/calls";

const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_SIGNATURE_HEADER = "x-twilio-signature";
let twilioAuthTokenWarningLogged = false;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const recordingUrl = getString(formData, "RecordingUrl");
  const signatureResult = validateTwilioSignature(req, formData);

  if (!recordingUrl && !signatureResult.valid) {
    console.warn(
      "[voice-webhook] Twilio signature validation failed for inbound event:",
      signatureResult.reason ?? "unknown",
    );
  }

  if (!recordingUrl) {
    const event = {
      from: getString(formData, "From"),
      to: getString(formData, "To"),
      callSid: getString(formData, "CallSid"),
    };
    const response = await handleTwilioVoiceEvent(event);
    return new NextResponse(response, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  if (!signatureResult.valid) {
    console.warn(
      "[voice-webhook] Twilio signature validation failed for recording callback:",
      signatureResult.reason ?? "unknown",
    );
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
  }

  const recordingEvent = {
    recordingUrl,
    from: getString(formData, "From"),
    to: getString(formData, "To"),
    recordingDuration: getString(formData, "RecordingDuration"),
    timestamp: getString(formData, "Timestamp"),
  };

  const response = await handleRecordingEvent(recordingEvent);
  return new NextResponse(response, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

type TwilioSignatureResult = {
  valid: boolean;
  reason?: string;
};

function validateTwilioSignature(req: NextRequest, formData: FormData): TwilioSignatureResult {
  if (!TWILIO_AUTH_TOKEN) {
    if (!twilioAuthTokenWarningLogged) {
      console.warn("[voice-webhook] TWILIO_AUTH_TOKEN not configured; skipping signature validation.");
      twilioAuthTokenWarningLogged = true;
    }
    return { valid: true };
  }

  const signature = req.headers.get(TWILIO_SIGNATURE_HEADER);
  if (!signature) {
    return { valid: false, reason: "missing Twilio signature header" };
  }

  const params = formDataToRecord(formData);
  try {
    const isValid = twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, req.url, params);
    return { valid: isValid, reason: isValid ? undefined : "signature mismatch" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "validation error";
    return { valid: false, reason };
  }
}

function formDataToRecord(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !(key in params)) {
      params[key] = value;
    }
  });
  return params;
}
