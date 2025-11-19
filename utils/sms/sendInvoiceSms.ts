// utils/sms/sendInvoiceSms.ts
"use server";

import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

type SendInvoiceSmsArgs = {
  to: string;
  customerName: string | null | undefined;
  invoiceNumber: number | string | null | undefined;
  invoiceTotal: number;
  publicUrl: string;
};

export async function sendInvoiceSms({
  to,
  customerName,
  invoiceNumber,
  invoiceTotal,
  publicUrl,
}: SendInvoiceSmsArgs) {
  if (!client || !fromNumber) {
    console.warn("Twilio not configured; skipping invoice SMS send.");
    return;
  }

  const body = `Hi ${customerName || ""}, your HandyBob invoice ${
    invoiceNumber ? `#${invoiceNumber} ` : ""
  }is $${invoiceTotal.toFixed(2)}. View/pay: ${publicUrl}`;

  await client.messages.create({
    from: fromNumber,
    to,
    body,
  });
}
