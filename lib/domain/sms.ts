"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import twilio from "twilio";

import { logMessage } from "@/utils/communications/logMessage";

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

export type OutboundSmsStatus = {
  ok: boolean;
  error?: string;
  messageSid?: string | null;
  sentAt: string;
  fromAddress?: string | null;
};

type SendOutboundSmsArgs = {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  to: string;
  body: string;
  context: string;
  customerId?: string | null;
  jobId?: string | null;
  quoteId?: string | null;
  invoiceId?: string | null;
  sentAt?: string;
};

type SendCustomerSmsArgs = Omit<
  SendOutboundSmsArgs,
  "context" | "quoteId" | "invoiceId"
>;

type SendQuoteSmsArgs = {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  to: string;
  customerId?: string | null;
  jobId?: string | null;
  quoteId?: string | null;
  customerName?: string | null;
  quoteTotal: number;
};

type SendInvoiceSmsArgs = {
  supabase: SupabaseClient;
  workspaceId: string;
  userId: string;
  to: string;
  customerId?: string | null;
  jobId?: string | null;
  quoteId?: string | null;
  invoiceId?: string | null;
  customerName?: string | null;
  invoiceNumber?: number | string | null | undefined;
  invoiceTotal: number;
  publicUrl: string;
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

export async function sendOutboundSms({
  supabase,
  workspaceId,
  userId,
  to,
  body,
  context,
  customerId,
  jobId,
  quoteId,
  invoiceId,
  sentAt,
}: SendOutboundSmsArgs): Promise<OutboundSmsStatus> {
  const sentAtIso = sentAt ?? new Date().toISOString();
  let result: TwilioSmsResult | null = null;
  let errorMessage: string | undefined;

  try {
    result = await sendTwilioSms({ to, body, context });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const status = result?.status ?? (errorMessage ? "failed" : "queued");
  const fromAddress = result?.from ?? fromNumber ?? null;

  await logMessage({
    supabase,
    workspaceId,
    userId,
    customerId: customerId ?? null,
    jobId: jobId ?? null,
    quoteId: quoteId ?? null,
    invoiceId: invoiceId ?? null,
    channel: "sms",
    via: "sms",
    toAddress: to,
    fromAddress,
    body,
    status,
    sentAt: sentAtIso,
    direction: "outbound",
  });

  if (result?.messageSid) {
    console.info(
      `[${context}] SMS sent workspace=${workspaceId} to=${to} messageSid=${result.messageSid} status=${status}`,
    );
  } else {
    console.info(`[${context}] SMS ${status} for workspace=${workspaceId} to=${to}`);
  }

  if (errorMessage) {
    console.error(`[${context}] Twilio SMS send failed: ${errorMessage}`);
    return { ok: false, error: errorMessage, sentAt: sentAtIso, fromAddress };
  }

  return {
    ok: true,
    messageSid: result?.messageSid ?? null,
    sentAt: sentAtIso,
    fromAddress,
  };
}

export async function sendCustomerSms({
  supabase,
  workspaceId,
  userId,
  to,
  body,
  customerId,
  jobId,
  sentAt,
}: SendCustomerSmsArgs): Promise<OutboundSmsStatus> {
  return sendOutboundSms({
    supabase,
    workspaceId,
    userId,
    to,
    body,
    context: "sendCustomerSms",
    customerId,
    jobId,
    sentAt,
  });
}

export async function sendQuoteSms({
  supabase,
  workspaceId,
  userId,
  to,
  customerId,
  jobId,
  quoteId,
  customerName,
  quoteTotal,
}: SendQuoteSmsArgs): Promise<OutboundSmsStatus> {
  const body = `Hi ${customerName || ""}, your quote from HandyBob is $${quoteTotal.toFixed(2)}. Check your email for details.`;

  return sendOutboundSms({
    supabase,
    workspaceId,
    userId,
    to,
    body,
    context: "sendQuoteSms",
    customerId,
    jobId,
    quoteId,
  });
}

export async function sendInvoiceSms({
  supabase,
  workspaceId,
  userId,
  to,
  customerId,
  jobId,
  quoteId,
  invoiceId,
  customerName,
  invoiceNumber,
  invoiceTotal,
  publicUrl,
}: SendInvoiceSmsArgs): Promise<OutboundSmsStatus> {
  const body = `Hi ${customerName || ""}, your HandyBob invoice ${
    invoiceNumber ? `#${invoiceNumber} ` : ""
  }is $${invoiceTotal.toFixed(2)}. View/pay: ${publicUrl}`;

  return sendOutboundSms({
    supabase,
    workspaceId,
    userId,
    to,
    body,
    context: "sendInvoiceSms",
    customerId,
    jobId,
    quoteId,
    invoiceId,
  });
}
