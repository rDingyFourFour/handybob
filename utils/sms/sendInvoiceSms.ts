"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendOutboundSms, type OutboundSmsStatus } from "./sendOutboundSms";

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
