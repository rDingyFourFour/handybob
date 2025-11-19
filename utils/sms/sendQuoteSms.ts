// utils/sms/sendQuoteSms.ts
"use server";

import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

const client =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

type SendQuoteSmsArgs = {
  to: string;
  customerName: string;
  quoteTotal: number;
};

export async function sendQuoteSms({
  to,
  customerName,
  quoteTotal,
}: SendQuoteSmsArgs) {
  if (!client || !fromNumber) {
    console.warn("Twilio not configured; skipping SMS send.");
    return;
  }

  const body = `Hi ${customerName || ""}, your quote from HandyBob is $${quoteTotal.toFixed(
    2
  )}. Check your email for details.`;

  await client.messages.create({
    from: fromNumber,
    to,
    body,
  });
}