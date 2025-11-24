// app/calls/processCallAction.ts
"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { inferAttentionSignals } from "@/utils/attention/inferAttentionSignals";
import { runLeadAutomations } from "@/utils/automation/runLeadAutomations";
import { classifyJobWithAi } from "@/utils/ai/classifyJob";
import { getCurrentWorkspace } from "@/utils/workspaces";
import { logAuditEvent } from "@/utils/audit/log";

const OPENAI_ENDPOINT = "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
// Twilio credentials stay server-side; used only for authenticated fetch of recording audio.

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

  const supabase = await createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  const result = await processCallCore({
    supabase,
    callId,
    enforceWorkspaceId: true,
    workspaceIdFilter: workspace.id,
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
    enforceWorkspaceId: false, // Service role bypasses RLS; we load by call.id directly.
  });
  return result.error ? { error: result.error } : { ok: true };
}

type ProcessCallCoreResult = {
  ok?: boolean;
  error?: string;
  jobId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
};

async function processCallCore({
  supabase,
  callId,
  enforceWorkspaceId,
  workspaceIdFilter,
}: {
  supabase: SupabaseClient;
  callId: string;
  enforceWorkspaceId: boolean;
  workspaceIdFilter?: string;
}): Promise<ProcessCallCoreResult> {
  // Load call (optionally scoped to user when called from UI)
  let query = supabase
    .from("calls")
    .select("id, user_id, workspace_id, recording_url, from_number, to_number, job_id, customer_id, status, direction")
    .eq("id", callId);

  if (enforceWorkspaceId && workspaceIdFilter) {
    query = query.eq("workspace_id", workspaceIdFilter);
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
  let linkedCustomerName: string | null | undefined = null;
  const workspaceId = call.workspace_id || workspaceIdFilter || null;
  if (!workspaceId) {
    return { error: "Workspace missing for call." };
  }

  const audioBuffer = await downloadRecording(call.recording_url);
  if (!audioBuffer) return { error: "Failed to download recording audio." };

  const transcript = await transcribeAudio(audioBuffer);
  if (!transcript) return { error: "Transcription failed." };

  const summary = await summarizeTranscript(transcript);
  if (!summary) return { error: "AI summary failed." };

  const signals = inferAttentionSignals({
    text: transcript,
    summary,
    direction: call.direction,
    status: call.status,
    hasJob: Boolean(call.job_id),
  });

  const { error: updateError } = await supabase
    .from("calls")
    .update({
      transcript,
      ai_summary: summary,
      status: "processed",
      priority: signals.priority,
      needs_followup: signals.needsFollowup || !call.job_id,
      attention_score: signals.attentionScore,
      attention_reason: signals.reason,
      ai_category: signals.category,
      ai_urgency: signals.urgency,
    })
    .eq("id", call.id);

  if (updateError) {
    return { error: updateError.message };
  }

  // If no job is attached yet, auto-create a lead + customer linkage.
  if (!call.job_id) {
    const { jobId, customerId, customerName, error: linkError } = await ensureJobForCall({
      supabase,
      call,
      transcript,
      summary,
      workspaceId,
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

    linkedCustomerName = customerName ?? linkedCustomerName;
  }

  if (linkedJobId) {
    const classification = await classifyJobWithAi({
      jobId: linkedJobId,
      userId: call.user_id,
      workspaceId: workspaceId ?? undefined,
      title: summary?.split(".")?.[0] ?? call.recording_url ?? undefined,
      description: transcript,
      transcript,
    }).catch((err) => {
      console.warn("[processCallCore] classifyJob failed:", err);
      return null;
    });

    if (classification?.ai_urgency === "emergency") {
      await runLeadAutomations({
        userId: call.user_id,
        workspaceId: workspaceId ?? call.workspace_id ?? "",
        jobId: linkedJobId,
        title: summary?.split(".")?.[0] ?? "Lead",
        customerName: linkedCustomerName ?? undefined,
        summary: summary,
        aiUrgency: classification.ai_urgency ?? undefined,
      });
    }
  }

  return { ok: true, jobId: linkedJobId ?? null, customerId: linkedCustomerId ?? null };
}

async function ensureJobForCall({
  supabase,
  call,
  transcript,
  summary,
  workspaceId,
}: {
  supabase: SupabaseClient;
  call: {
    id: string;
    user_id: string;
    workspace_id?: string | null;
    from_number?: string | null;
    job_id?: string | null;
    customer_id?: string | null;
  };
  transcript: string;
  summary: string;
  workspaceId: string | null;
}) {
  // Future: enrich job with AI-derived category/urgency/location once we trust the model outputs.
  const phone = call.from_number?.trim() || null;
  const resolvedWorkspaceId = workspaceId ?? call.workspace_id ?? null;

  let customerId = call.customer_id ?? null;
  let customerName: string | null = null;
  if (!customerId && phone) {
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id, name")
      .eq("phone", phone)
      .eq("workspace_id", resolvedWorkspaceId ?? "")
      .maybeSingle();
    customerId = existingCustomer?.id ?? null;
    customerName = existingCustomer?.name ?? null;
  }

  if (!customerId) {
    const name = phone ? `Caller ${phone}` : "Unknown caller";
    const { data: newCustomer, error: createCustomerError } = await supabase
      .from("customers")
      .insert({
        user_id: call.user_id,
        workspace_id: resolvedWorkspaceId ?? undefined,
        name,
        phone,
      })
      .select("id, name")
      .single();

    if (createCustomerError) {
      return { error: createCustomerError.message };
    }

    customerId = newCustomer?.id ?? null;
    customerName = newCustomer?.name ?? name;
  }

  const leadTitle =
    summary?.split(".")?.[0]?.trim() ||
    (phone ? `Voicemail from ${phone}` : "Voicemail lead");

  const signals = inferAttentionSignals({
    text: transcript,
    summary,
    direction: "inbound",
    status: "voicemail",
    hasJob: Boolean(call.job_id),
  });

  const jobInsert: Record<string, unknown> = {
    user_id: call.user_id,
    workspace_id: resolvedWorkspaceId ?? undefined,
    customer_id: customerId,
    title: leadTitle,
    description_raw: transcript,
    description_ai_summary: summary,
    status: "lead",
    source: "phone_call",
    category: signals.category,
    urgency: signals.urgency,
    priority: signals.priority,
    attention_score: signals.attentionScore,
    attention_reason: signals.reason,
  };

  const { data: newJob, error: jobError } = await supabase
    .from("jobs")
    .insert(jobInsert)
    .select("id")
    .single();

  if (jobError) {
    return { error: jobError.message };
  }

  // Audit: job created from call/voicemail
  if (workspaceId) {
    await logAuditEvent({
      supabase,
      workspaceId,
      actorUserId: call.user_id,
      action: "job_created",
      entityType: "job",
      entityId: newJob?.id ?? null,
      metadata: { source: "phone_call", call_id: call.id },
    });
  }

  return { jobId: newJob?.id ?? null, customerId, customerName };
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
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown fetch error";
    console.warn("[processCallRecording] Error downloading recording:", message);
    return null;
  }
}

async function transcribeAudio(audio: Uint8Array) {
  const buffer = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer;
  const formData = new FormData();
  formData.append("file", new Blob([buffer], { type: "audio/mpeg" }), "voicemail.mp3");
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
      // Sends transcript text only for this call; expects a short text summary back.
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
