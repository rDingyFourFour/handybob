// app/calls/processCallAction.ts
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

const OPENAI_ENDPOINT = "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

export async function processCallRecording(formData: FormData): Promise<void> {
  const callId = formData.get("call_id");
  if (typeof callId !== "string") {
    console.warn("[processCallRecording] Missing call_id.");
    return;
  }
  if (!OPENAI_KEY) {
    console.warn("[processCallRecording] OPENAI_API_KEY is not configured.");
    return;
  }

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    console.warn("[processCallRecording] User not signed in.");
    return;
  }

  const result = await processCallCore({
    supabase,
    callId,
    enforceUserId: true,
    userIdFilter: user.id,
  });

  if (result.error) {
    console.warn("[processCallRecording] Failed to process:", result.error);
    return;
  }

  // Refresh calls UI
  revalidatePath("/calls");
  if (result.jobId) revalidatePath(`/jobs/${result.jobId}`);
  if (result.customerId) revalidatePath(`/customers/${result.customerId}`);
}

// Automation hook: can be called from webhooks/scheduled jobs using the service-role client.
// Errors should be logged by the caller; this returns a structured result for retries.
export async function processCallById(callId: string): Promise<{ ok?: boolean; error?: string }> {
  if (!OPENAI_KEY) return { error: "OPENAI_API_KEY is not configured." };
  const supabase = createAdminClient();
  const result = await processCallCore({
    supabase,
    callId,
    enforceUserId: false, // Service role bypasses RLS; we load by call.id directly.
  });
  return result.error ? { error: result.error } : { ok: true };
}

type ProcessCallCoreResult = {
  ok?: boolean;
  error?: string;
  jobId?: string | null;
  customerId?: string | null;
};

async function processCallCore({
  supabase,
  callId,
  enforceUserId,
  userIdFilter,
}: {
  supabase: SupabaseClient;
  callId: string;
  enforceUserId: boolean;
  userIdFilter?: string;
}): Promise<ProcessCallCoreResult> {
  // Load call (optionally scoped to user when called from UI)
  let query = supabase
    .from("calls")
    .select("id, user_id, recording_url, from_number, to_number, job_id, customer_id, status")
    .eq("id", callId);

  if (enforceUserId && userIdFilter) {
    query = query.eq("user_id", userIdFilter);
  }

  const { data: call, error: loadError } =
    (await query.maybeSingle?.()) ??
    (await query.single?.()) ??
    { data: null, error: { message: "Call not found." } };

  if (loadError || !call) {
    return { error: loadError?.message || "Call not found." };
  }
  if (!call.recording_url) {
    return { error: "No recording_url available on this call." };
  }

  let linkedJobId: string | null | undefined = call.job_id;
  let linkedCustomerId: string | null | undefined = call.customer_id;

  const audioBuffer = await downloadRecording(call.recording_url);
  if (!audioBuffer) return { error: "Failed to download recording audio." };

  const transcript = await transcribeAudio(audioBuffer);
  if (!transcript) return { error: "Transcription failed." };

  const summary = await summarizeTranscript(transcript);
  if (!summary) return { error: "AI summary failed." };

  const { error: updateError } = await supabase
    .from("calls")
    .update({
      transcript,
      ai_summary: summary,
      status: "processed",
    })
    .eq("id", call.id);

  if (updateError) {
    return { error: updateError.message };
  }

  // If no job is attached yet, auto-create a lead + customer linkage.
  if (!call.job_id) {
    const { jobId, customerId, error: linkError } = await ensureJobForCall({
      supabase,
      call,
      transcript,
      summary,
    });

    if (linkError) {
      return { error: linkError };
    }

    linkedJobId = jobId ?? linkedJobId;
    linkedCustomerId = customerId ?? linkedCustomerId;

    if (jobId || customerId) {
      const { error: patchError } = await supabase
        .from("calls")
        .update({
          job_id: linkedJobId ?? null,
          customer_id: linkedCustomerId ?? null,
        })
        .eq("id", call.id);

      if (patchError) {
        return { error: patchError.message };
      }
    }
  }

  return { ok: true, jobId: linkedJobId ?? null, customerId: linkedCustomerId ?? null };
}

async function ensureJobForCall({
  supabase,
  call,
  transcript,
  summary,
}: {
  supabase: SupabaseClientLike;
  call: {
    id: string;
    user_id: string;
    from_number?: string | null;
    job_id?: string | null;
    customer_id?: string | null;
  };
  transcript: string;
  summary: string;
}) {
  // Future: enrich job with AI-derived category/urgency/location once we trust the model outputs.
  const phone = call.from_number?.trim() || null;

  let customerId = call.customer_id ?? null;
  if (!customerId && phone) {
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", phone)
      .eq("user_id", call.user_id)
      .maybeSingle();
    customerId = existingCustomer?.id ?? null;
  }

  if (!customerId) {
    const name = phone ? `Caller ${phone}` : "Unknown caller";
    const { data: newCustomer, error: createCustomerError } = await supabase
      .from("customers")
      .insert({
        user_id: call.user_id,
        name,
        phone,
      })
      .select("id")
      .single();

    if (createCustomerError) {
      return { error: createCustomerError.message };
    }

    customerId = newCustomer?.id ?? null;
  }

  const leadTitle =
    summary?.split(".")?.[0]?.trim() ||
    (phone ? `Voicemail from ${phone}` : "Voicemail lead");

  const jobInsert: Record<string, unknown> = {
    user_id: call.user_id,
    customer_id: customerId,
    title: leadTitle,
    description_raw: transcript,
    description_ai_summary: summary,
    status: "lead",
    source: "phone_call",
  };

  const { data: newJob, error: jobError } = await supabase
    .from("jobs")
    .insert(jobInsert)
    .select("id")
    .single();

  if (jobError) {
    return { error: jobError.message };
  }

  return { jobId: newJob?.id ?? null, customerId };
}

async function downloadRecording(url: string) {
  // Twilio recording URLs require Basic auth when not public.
  const authHeader =
    TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
      ? `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`
      : null;

  try {
    const canonicalUrl = url.endsWith(".mp3") ? url : `${url}.mp3`;
    const res = await fetch(canonicalUrl, {
      headers: authHeader ? { Authorization: authHeader } : {},
    });
    if (!res.ok) {
      console.warn("[processCallRecording] Failed to fetch recording:", res.status, res.statusText);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown fetch error";
    console.warn("[processCallRecording] Error downloading recording:", message);
    return null;
  }
}

async function transcribeAudio(audio: Buffer) {
  const formData = new FormData();
  formData.append("file", new Blob([audio], { type: "audio/mpeg" }), "voicemail.mp3");
  formData.append("model", "whisper-1");
  formData.append("response_format", "text");

  const res = await fetch(`${OPENAI_ENDPOINT}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.warn("[processCallRecording] Whisper transcription failed:", errorText);
    return null;
  }

  return res.text();
}

async function summarizeTranscript(transcript: string) {
  const prompt = `
Here is a voicemail transcript from a customer calling a handyman. Summarize the request in 2–4 sentences and extract any explicit details like location hints, timing, and urgency. Use contractor-friendly language.

Transcript:
${transcript}
`.trim();

  const response = await fetch(`${OPENAI_ENDPOINT}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      response_format: { type: "text" },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.warn("[processCallRecording] Summary request failed:", errorBody);
    return null;
  }

  const payload = (await response.json()) as {
    output?: { content?: { text?: string[] }[] }[];
  };

  const textChunk = payload.output?.[0]?.content?.find(
    (chunk) => Array.isArray(chunk.text) && chunk.text.length > 0,
  );

  return textChunk?.text?.[0]?.trim() ?? null;
}
