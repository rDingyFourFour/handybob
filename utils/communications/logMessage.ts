// utils/communications/logMessage.ts
import type { SupabaseClient } from "@supabase/supabase-js";
// Convention: always link messages to the most specific context available
// (quote_id/invoice_id first, then job_id + customer_id) so timelines stay rich.
// TODO [TECH_DEBT #3]: inbound messages will come from a webhook endpoint (e.g., /api/webhooks/email or /api/webhooks/sms)
// that will:
//  - Match or create a customer by from_address/phone.
//  - Look up the most recent open job for that customer (if any) and attach job_id.
//  - Insert messages with direction = 'inbound' plus sender metadata so timelines include customer replies.
type LogMessageArgs = {
  supabase: SupabaseClient;
  workspaceId: string;
  userId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
  quoteId?: string | null;
  invoiceId?: string | null;
  channel: string;
  direction?: string;
  subject?: string | null;
  body?: string | null;
  status?: string | null;
  externalId?: string | null;
  toAddress?: string | null;
  fromAddress?: string | null;
  sentAt?: string | null;
  via?: string | null;
};

export type LogMessageResult = {
  ok: boolean;
  messageId: string | null;
  error?: string | null;
};

export async function logMessage({
  supabase,
  workspaceId,
  userId,
  customerId,
  jobId,
  quoteId,
  invoiceId,
  channel,
  direction = "outbound",
  subject,
  body,
  status = "sent",
  externalId,
  toAddress,
  fromAddress,
  sentAt,
  via,
}: LogMessageArgs): Promise<LogMessageResult> {
  if (!workspaceId || !userId) {
    console.warn("[logMessage] Missing workspaceId or userId; skipping log.");
    return { ok: false, messageId: null, error: "Missing workspace or user context" };
  }

  const normalizedChannel = channel.toLowerCase();
  // Supabase only recognizes message_via members like 'email' and 'sms', so treat note channels as email entries.
  const resolvedVia = via ?? (normalizedChannel === "note" ? "email" : undefined);

  const { data, error } = await supabase
    .from("messages")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      customer_id: customerId ?? null,
      job_id: jobId ?? null,
      quote_id: quoteId ?? null,
      invoice_id: invoiceId ?? null,
      channel,
      direction,
      subject,
      body,
      to_address: toAddress ?? null,
      from_address: fromAddress ?? null,
      sent_at: sentAt ?? null,
      ...(resolvedVia ? { via: resolvedVia } : {}),
      status: status ?? "sent",
      external_id: externalId ?? null,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    const errorMessage = error?.message ?? "Failed to insert message record";
    console.warn("[logMessage] Failed to insert message record:", errorMessage);
    return { ok: false, messageId: data?.id ?? null, error: errorMessage };
  }

  return { ok: true, messageId: data.id };
}
