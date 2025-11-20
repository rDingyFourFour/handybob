// utils/communications/logMessage.ts
// Convention: always link messages to the most specific context available
// (quote_id/invoice_id first, then job_id + customer_id) so timelines stay rich.
// TODO: inbound messages will come from a webhook endpoint (e.g., /api/webhooks/email or /api/webhooks/sms)
// that will:
//  - Match or create a customer by from_address/phone.
//  - Look up the most recent open job for that customer (if any) and attach job_id.
//  - Insert messages with direction = 'inbound' plus sender metadata so timelines include customer replies.
type LogMessageArgs = {
  supabase: {
    from: (table: string) => {
      insert: (values: Record<string, unknown> | Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>;
    };
  };
  userId: string;
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
};

export async function logMessage({
  supabase,
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
}: LogMessageArgs) {
  if (!userId) return;

  const { error } = await supabase.from("messages").insert({
    user_id: userId,
    customer_id: customerId ?? null,
    job_id: jobId ?? null,
    quote_id: quoteId ?? null,
    invoice_id: invoiceId ?? null,
    channel,
    direction,
    subject,
    body,
    status: status ?? "sent",
    external_id: externalId ?? null,
  });

  if (error) {
    console.warn("[logMessage] Failed to insert message record:", error.message);
  }
}
