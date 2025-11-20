// utils/communications/logMessage.ts
type LogMessageArgs = {
  supabase: {
    from: (table: string) => {
      insert: (values: Record<string, unknown> | Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>;
    };
  };
  userId: string;
  customerId?: string | null;
  jobId?: string | null;
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
