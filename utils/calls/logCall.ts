// utils/calls/logCall.ts
// Convention: always attach calls to the most specific context (job_id if known, plus customer_id).
// TODO: inbound calls will be recorded by a phone webhook endpoint (e.g., /api/webhooks/voice from Twilio).
//  - The webhook will look up or create a customer by from_number.
//  - It will try to find the latest active job for that customer and set job_id.
//  - It will insert a call row with direction = 'inbound', status, recording_url, transcript/ai_summary.

type LogCallArgs = {
  supabase: {
    from: (table: string) => {
      insert: (values: Record<string, unknown> | Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>;
    };
  };
  userId: string;
  customerId?: string | null;
  jobId?: string | null;
  direction?: string;
  status?: string;
  fromNumber?: string | null;
  toNumber?: string | null;
  summary?: string | null;
  recordingUrl?: string | null;
};

export async function logCall({
  supabase,
  userId,
  customerId,
  jobId,
  direction = "outbound",
  status = "completed",
  fromNumber,
  toNumber,
  summary,
  recordingUrl,
}: LogCallArgs) {
  if (!userId) return;

  const { error } = await supabase.from("calls").insert({
    user_id: userId,
    customer_id: customerId ?? null,
    job_id: jobId ?? null,
    direction,
    status,
    from_number: fromNumber ?? null,
    to_number: toNumber ?? null,
    summary: summary ?? null,
    recording_url: recordingUrl ?? null,
  });

  if (error) {
    console.warn("[logCall] Failed to insert call record:", error.message);
  }
}
