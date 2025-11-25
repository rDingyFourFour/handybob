"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logMessage } from "@/utils/communications/logMessage";
import { sendTwilioSms, type TwilioSmsResult } from "./sendTwilioSms";

// Logs emitted here use `context` + `workspace_id` so you can filter by route/job/customer when debugging Twilio sends.

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
  const fromAddress = result?.from ?? process.env.TWILIO_FROM_NUMBER ?? null;

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
    console.info(
      `[${context}] SMS ${status} for workspace=${workspaceId} to=${to}`,
    );
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

// QA checklist for Twilio test mode:
// 1) Enable Twilio Test Credentials and use the provided test credentials for TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN.
// 2) Use reserved "To" numbers from Twilio's test number list so requests always succeed/fail deterministically.
// 3) Verify `messages` rows are inserted with the correct `channel`, `direction`, `to_address`, `from_address`, and `status`.
// Logs go to the server console; filter by `[context]` (e.g., `sendInvoiceSms`) when tracing Twilio sends.
