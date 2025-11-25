"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendOutboundSms, type OutboundSmsStatus } from "./sendOutboundSms";

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
  const body = `Hi ${customerName || ""}, your quote from HandyBob is $${quoteTotal.toFixed(
    2
  )}. Check your email for details.`;

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
