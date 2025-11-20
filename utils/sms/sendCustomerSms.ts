// utils/sms/sendCustomerSms.ts
"use server";

import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

const client =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

type SendCustomerSmsArgs = {
  to: string;
  body: string;
};

export async function sendCustomerSms({ to, body }: SendCustomerSmsArgs) {
  if (!client || !fromNumber) {
    console.warn("[sendCustomerSms] Twilio not configured; skipping SMS send.");
    return null;
  }

  await client.messages.create({
    from: fromNumber,
    to,
    body,
  });

  return fromNumber;
}
