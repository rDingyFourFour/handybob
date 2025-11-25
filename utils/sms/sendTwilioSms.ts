"use server";

import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

export type TwilioSmsResult = {
  messageSid: string;
  status: string;
  from: string;
  to: string;
};

export async function sendTwilioSms({
  to,
  body,
  context,
}: {
  to: string;
  body: string;
  context: string;
}): Promise<TwilioSmsResult | null> {
  if (!client || !fromNumber) {
    console.warn(`[${context}] Twilio not configured; skipping SMS send.`);
    return null;
  }

  try {
    const message = await client.messages.create({
      from: fromNumber,
      to,
      body,
    });

    console.info(`[${context}] SMS to ${to} queued (sid: ${message.sid}).`);

    return {
      messageSid: message.sid,
      status: message.status ?? "queued",
      from: message.from ?? fromNumber,
      to: message.to ?? to,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[${context}] Twilio SMS to ${to} failed: ${message}`);
    throw error;
  }
}
