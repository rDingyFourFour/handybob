// Server-only. Import only from server actions/route handlers.
"use server";

import twilio from "twilio";

import {
  DialTwilioCallArgs,
  TWILIO_STATUS_CALLBACK_EVENTS,
  TwilioDialFailure,
  TwilioDialFailureCode,
  TwilioDialResult,
} from "@/lib/domain/twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

function createFailure(
  code: TwilioDialFailureCode,
  message: string,
  twilioErrorCode?: string,
  twilioErrorMessage?: string,
): TwilioDialFailure {
  return {
    success: false,
    code,
    message,
    twilioErrorCode,
    twilioErrorMessage,
  };
}

function resolveTwilioClient() {
  if (!accountSid || !authToken) {
    return null;
  }
  return twilio(accountSid, authToken);
}

function buildCallbackUrl(callbackUrl: string, metadata: DialTwilioCallArgs["metadata"]) {
  try {
    const url = new URL(callbackUrl);
    url.searchParams.set("callId", metadata.callId);
    url.searchParams.set("workspaceId", metadata.workspaceId);
    return url.toString();
  } catch {
    return null;
  }
}

export async function dialTwilioCall(args: DialTwilioCallArgs): Promise<TwilioDialResult> {
  const client = resolveTwilioClient();
  if (!client) {
    return createFailure("twilio_not_configured", "Missing Twilio credentials.");
  }

  const statusCallback = buildCallbackUrl(args.callbackUrl, args.metadata);
  if (!statusCallback) {
    return createFailure("twilio_not_configured", "Unable to resolve the Twilio status callback URL.");
  }

  let recordingCallback: string | null = null;
  if (args.recordCall) {
    if (!args.recordingCallbackUrl) {
      return createFailure("twilio_not_configured", "Unable to resolve the Twilio recording callback URL.");
    }
    recordingCallback = buildCallbackUrl(args.recordingCallbackUrl, args.metadata);
    if (!recordingCallback) {
      return createFailure("twilio_not_configured", "Unable to resolve the Twilio recording callback URL.");
    }
  }

  try {
    const response = await client.calls.create({
      to: args.toPhone,
      from: args.fromPhone,
      twiml: `
        <Response>
          <Say voice="alice">
            Thank you for scheduling time with HandyBob. Please hold while we connect you.
          </Say>
        </Response>
      `,
      statusCallback,
      statusCallbackMethod: "POST",
      statusCallbackEvent: TWILIO_STATUS_CALLBACK_EVENTS.map((event) => event),
      record: args.recordCall ? true : undefined,
      recordingStatusCallback: recordingCallback ?? undefined,
      recordingStatusCallbackMethod: recordingCallback ? "POST" : undefined,
      recordingStatusCallbackEvent: recordingCallback ? ["completed"] : undefined,
      machineDetection: args.machineDetection?.enabled ? "Enable" : undefined,
    });

    return {
      success: true,
      twilioCallSid: response.sid,
      initialStatus: response.status ?? "queued",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Twilio call failed.";
    const twilioErrorCode =
      error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : undefined;
    const twilioErrorMessage =
      error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : undefined;
    return createFailure("twilio_provider_error", message, twilioErrorCode, twilioErrorMessage);
  }
}
