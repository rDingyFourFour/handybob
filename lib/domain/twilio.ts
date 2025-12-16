"use server";

import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const TWILIO_STATUS_CALLBACK_EVENTS = ["initiated", "ringing", "answered", "completed"] as const;

export class TwilioConfigurationError extends Error {}

export type MachineDetectionConfig = {
  enabled?: boolean;
};

export type DialTwilioCallArgs = {
  toPhone: string;
  fromPhone: string;
  callbackUrl: string;
  metadata: {
    callId: string;
    workspaceId: string;
  };
  machineDetection?: MachineDetectionConfig;
};

export type TwilioDialResult = {
  twilioCallSid: string;
  initialStatus: string;
};

function ensureTwilioClient() {
  if (!accountSid || !authToken) {
    throw new TwilioConfigurationError("Missing Twilio credentials.");
  }
  return twilio(accountSid, authToken);
}

function buildStatusCallbackUrl(callbackUrl: string, metadata: DialTwilioCallArgs["metadata"]) {
  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    throw new TwilioConfigurationError("Invalid Twilio callback URL.");
  }
  url.searchParams.set("callId", metadata.callId);
  url.searchParams.set("workspaceId", metadata.workspaceId);
  return url.toString();
}

export async function dialTwilioCall(args: DialTwilioCallArgs): Promise<TwilioDialResult> {
  const client = ensureTwilioClient();
  const statusCallback = buildStatusCallbackUrl(args.callbackUrl, args.metadata);

  const twiml = `
    <Response>
      <Say voice="alice">
        Thank you for scheduling time with HandyBob. Please hold while we connect you.
      </Say>
    </Response>
  `;

  const response = await client.calls.create({
    to: args.toPhone,
    from: args.fromPhone,
    twiml,
    statusCallback,
    statusCallbackMethod: "POST",
    statusCallbackEvent: TWILIO_STATUS_CALLBACK_EVENTS.map((event) => event),
    machineDetection: args.machineDetection?.enabled ? "Enable" : undefined,
  });

  return {
    twilioCallSid: response.sid,
    initialStatus: response.status ?? "queued",
  };
}
