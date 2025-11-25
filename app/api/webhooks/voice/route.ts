import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

import { createAdminClient } from "@/utils/supabase/admin";
import { generateUniqueWorkspaceSlug } from "@/utils/workspaces";
import { classifyJobWithAi } from "@/utils/ai/classifyJob";
import { inferAttentionSignals, type AttentionSignals } from "@/utils/attention/inferAttentionSignals";
import { runLeadAutomations } from "@/utils/automation/runLeadAutomations";
import { logAuditEvent } from "@/utils/audit/log";

// Twilio voice webhook (shared inbound + recording callback):
// - Stage 1: Twilio requests TwiML that greets the caller and instructs recording; no RecordingUrl is present yet.
// - Stage 2: Twilio posts RecordingUrl/CallSid back to the same endpoint, and we persist the call + transcription/AI workups.
// - TODO: split into `/api/voice/inbound` + `/api/voice/recording` later, keeping the same signatures for the Twilio config.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual test script (dev):
// 1) Set TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/VOICE_FALLBACK_USER_ID and run the dev server behind a tunnel (ngrok/Cloudflare) pointing Twilio Voice webhook to /api/webhooks/voice.
// 2) Call your Twilio number and leave a voicemail.
// 3) Expect: calls row created with recording_url, transcript/summary populated, job created/linked in the same workspace, automation fires if AI urgency = emergency.
// 4) Send a duplicate RecordingUrl callback to confirm duplicate recording is skipped.

type CustomerRow = {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  name: string | null;
  phone: string | null;
};

type JobRow = {
  id: string;
  status: string | null;
  title: string | null;
};

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ENDPOINT = "https://api.openai.com/v1";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const DEFAULT_USER_ID = process.env.VOICE_FALLBACK_USER_ID;
const TWILIO_SIGNATURE_HEADER = "x-twilio-signature";
let twilioAuthTokenWarningLogged = false;

// Primary handler: validates Twilio signature-less payload, routes stage 1 vs stage 2, and always returns TwiML/XML for Twilio.
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const recordingUrl = getString(formData, "RecordingUrl");
  const isRecordingCallback = Boolean(recordingUrl);
  const signatureResult = validateTwilioSignature(req, formData);

  if (!isRecordingCallback && !signatureResult.valid) {
    console.warn(
      "[voice-webhook] Twilio signature validation failed for stage 1:",
      signatureResult.reason ?? "unknown",
    );
  }

  // Stage 1: initial inbound call -> instruct Twilio to record a voicemail.
  if (!recordingUrl) {
    // Expected inbound payload: From, To, CallSid (no RecordingUrl yet).
    // DB: no writes here; this route only returns TwiML. Call rows are inserted by /api/voice/inbound (legacy path) or on callback below.
    const response = new twilio.twiml.VoiceResponse();
    response.say(
      { voice: "alice" },
      "Thanks for calling HandyBob. Please leave your name, the work you need done, and the best time to reach you after the beep."
    );
    response.record({
      action: "/api/webhooks/voice",
      method: "POST",
      maxLength: 120,
      playBeep: true,
      trim: "do-not-trim",
    });
    response.say({ voice: "alice" }, "We did not receive a message. Goodbye.");

    return new NextResponse(response.toString(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Stage 2: Twilio posts back the recording + metadata.
  if (!signatureResult.valid) {
    console.warn(
      "[voice-webhook] Twilio signature validation failed for recording callback:",
      signatureResult.reason ?? "unknown",
    );
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
  }
  try {
    await handleVoicemailCallback(formData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[voice-webhook] Failed to process voicemail:", message);
  }

  // Close out the call cleanly; Twilio ignores this body for status callbacks
  // but responds to <Record action="..."> with the returned TwiML.
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: "alice" }, "Thanks. We received your voicemail.");

  return new NextResponse(response.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

// Handles the RecordingUrl callback: persists call metadata, creates leads, ties customers/jobs, and fires automations using the admin client.
async function handleVoicemailCallback(formData: FormData) {
  const supabase = createAdminClient();

  const recordingUrl = getString(formData, "RecordingUrl");
  const fromNumber = normalizePhone(getString(formData, "From"));
  const toNumber = normalizePhone(getString(formData, "To"));
  const recordingDuration = parseInt(getString(formData, "RecordingDuration") ?? "0", 10);
  const callStartedAt = parseTimestamp(getString(formData, "Timestamp")) ?? new Date().toISOString();

  if (!recordingUrl) {
    console.warn("[voice-webhook] Missing RecordingUrl; nothing to save.");
    return;
  }
  const canonicalRecordingUrl = recordingUrl.endsWith(".mp3") ? recordingUrl : `${recordingUrl}.mp3`;

  const existingCustomer = await findCustomerByPhone(supabase, fromNumber);
  const userId =
    existingCustomer?.user_id ??
    DEFAULT_USER_ID ??
    (await getFirstUserId(supabase));

  if (!userId) {
    console.warn("[voice-webhook] No user found to attach voicemail; aborting save.");
    return;
  }

  const workspaceId = await getWorkspaceIdForUser(supabase, userId);
  if (!workspaceId) {
    console.warn("[voice-webhook] No workspace found for user:", userId);
    return;
  }

  const scopedCustomer =
    existingCustomer && (!existingCustomer.workspace_id || existingCustomer.workspace_id === workspaceId)
      ? existingCustomer
      : null;

  const customer =
    scopedCustomer ??
    (await createCustomerFromCall(supabase, userId, workspaceId, fromNumber));
  const activeJob = customer
    ? await findOpenJobForCustomer(supabase, userId, workspaceId, customer.id)
    : null;

  const { data: existingCall } = await supabase
    .from("calls")
    .select("id")
    .eq("recording_url", canonicalRecordingUrl)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (existingCall?.id) {
    console.log("[voice-webhook] Recording already captured; skipping duplicate insert.");
    return;
  }

  const audioBuffer = await fetchRecordingBuffer(canonicalRecordingUrl);
  const transcript = await transcribeRecording(audioBuffer);
  const aiInsights = await summarizeTranscript(transcript);
  const shouldCreateJob =
    aiInsights?.shouldCreateJob ??
    aiInsights?.should_create_job ??
    true;
  const summaryText =
    aiInsights?.summary ??
    (transcript ? truncateText(transcript, 260) : "New voicemail");

  const jobId =
    activeJob?.id ??
    (shouldCreateJob && customer
      ? await createLeadFromVoicemail({
          supabase,
          userId,
          workspaceId,
          customerId: customer.id,
          fromNumber,
          aiSummary: aiInsights?.summary,
          transcript,
          leadTitle: aiInsights?.lead_title,
          leadDescription: aiInsights?.lead_description,
          signals: inferAttentionSignals({
            text: transcript ?? undefined,
            summary: aiInsights?.summary ?? undefined,
            direction: "inbound",
            status: "voicemail",
            hasJob: Boolean(activeJob?.id),
          }),
        })
      : null);

  const attentionSignals =
    inferAttentionSignals({
      text: transcript ?? undefined,
      summary: aiInsights?.summary ?? undefined,
      direction: "inbound",
      status: "voicemail",
      hasJob: Boolean(jobId ?? activeJob?.id),
    });

  await supabase.from("calls").insert({
    user_id: userId,
    workspace_id: workspaceId,
    customer_id: customer?.id ?? null,
    job_id: jobId ?? null,
    direction: "inbound",
    status: "voicemail",
    started_at: callStartedAt,
    duration_seconds: Number.isFinite(recordingDuration) ? recordingDuration : 0,
    summary: summaryText,
    ai_summary: aiInsights?.summary ?? null,
    transcript: transcript ?? null,
    recording_url: canonicalRecordingUrl,
    from_number: fromNumber ?? null,
    to_number: toNumber ?? null,
    priority: attentionSignals.priority,
    needs_followup: attentionSignals.needsFollowup || !jobId,
    attention_score: attentionSignals.attentionScore,
    attention_reason: attentionSignals.reason,
    ai_category: attentionSignals.category,
    ai_urgency: attentionSignals.urgency,
  });

  if (jobId) {
    const classification = await classifyJobWithAi({
      jobId,
      userId,
      workspaceId,
      title: aiInsights?.lead_title ?? summaryText,
      description: aiInsights?.summary ?? transcript ?? undefined,
      transcript: transcript ?? undefined,
    });

    if (classification?.ai_urgency === "emergency") {
      await runLeadAutomations({
        userId,
        workspaceId,
        jobId,
        title: aiInsights?.lead_title ?? summaryText,
        customerName: customer?.name ?? null,
        summary: aiInsights?.summary ?? transcript ?? null,
        aiUrgency: classification.ai_urgency,
      });
    }
  }
}

async function findCustomerByPhone(supabase: SupabaseAdminClient, phone: string | null) {
  if (!phone) return null;
  const { data } = await supabase
    .from("customers")
    .select("id, user_id, workspace_id, name, phone")
    .eq("phone", phone)
    .limit(1);
  return (data?.[0] as CustomerRow | undefined) ?? null;
}

async function createCustomerFromCall(
  supabase: SupabaseAdminClient,
  userId: string,
  workspaceId: string,
  phone: string | null,
) {
  const placeholderName = phone ? `Caller ${phone}` : "New voicemail lead";
  const { data, error } = await supabase
    .from("customers")
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      phone,
      name: placeholderName,
    })
    .select("id, user_id, name, phone")
    .single();

  if (error) {
    console.error("[voice-webhook] Failed to create customer:", error.message);
    return null;
  }

  return data as CustomerRow;
}

async function findOpenJobForCustomer(
  supabase: SupabaseAdminClient,
  userId: string,
  workspaceId: string,
  customerId: string,
) {
  const CLOSED_STATUSES = ["completed", "cancelled", "closed", "lost", "done"];
  const { data } = await supabase
    .from("jobs")
    .select("id, status, title")
    .eq("customer_id", customerId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(5);

  const jobs = (data ?? []) as JobRow[];
  return jobs.find((job) => !CLOSED_STATUSES.includes((job.status ?? "").toLowerCase())) ?? null;
}

async function createLeadFromVoicemail({
  supabase,
  userId,
  workspaceId,
  customerId,
  fromNumber,
  aiSummary,
  transcript,
  leadTitle,
  leadDescription,
  signals,
}: {
  supabase: SupabaseAdminClient;
  userId: string;
  workspaceId: string;
  customerId: string;
  fromNumber: string | null;
  aiSummary?: string | null;
  transcript?: string | null;
  leadTitle?: string | null;
  leadDescription?: string | null;
  signals?: AttentionSignals | null;
}) {
  const title =
    leadTitle?.trim() ||
    aiSummary?.split(".")?.[0]?.trim() ||
    (fromNumber ? `Voicemail from ${fromNumber}` : "New voicemail lead");
  const description =
    leadDescription?.trim() ||
    aiSummary?.trim() ||
    transcript?.trim() ||
    "Voicemail captured automatically.";

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      customer_id: customerId,
      title,
      description_raw: description,
      status: "lead",
      source: "voicemail",
      category: signals?.category ?? null,
      urgency: signals?.urgency ?? null,
      priority: signals?.priority ?? "normal",
      attention_score: signals?.attentionScore ?? 0,
      attention_reason: signals?.reason ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[voice-webhook] Failed to create lead from voicemail:", error.message);
    return null;
  }

  // Audit: job created from voicemail
  await logAuditEvent({
    supabase,
    workspaceId,
    actorUserId: userId,
    action: "job_created",
    entityType: "job",
    entityId: (data as { id?: string } | null)?.id ?? null,
    metadata: { source: "voicemail", call_from: fromNumber },
  });

  return data?.id as string | null;
}

async function fetchRecordingBuffer(recordingUrl: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn("[voice-webhook] Twilio credentials missing; skipping transcription fetch.");
    return null;
  }

  try {
    const url = recordingUrl.endsWith(".mp3") ? recordingUrl : `${recordingUrl}.mp3`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      },
    });

    if (!res.ok) {
      console.warn("[voice-webhook] Failed to download recording:", res.status, res.statusText);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error";
    console.warn("[voice-webhook] Error fetching recording audio:", message);
    return null;
  }
}

async function transcribeRecording(audio: Uint8Array | null) {
  if (!OPENAI_KEY) {
    console.warn("[voice-webhook] OPENAI_API_KEY not set; skipping transcription.");
    return null;
  }
  if (!audio) return null;

  // Convert to a plain ArrayBuffer slice to satisfy BlobPart typing in strict TS.
  const buffer = audio.buffer.slice(
    audio.byteOffset,
    audio.byteOffset + audio.byteLength,
  ) as ArrayBuffer;
  const fileBlob = new Blob([buffer], {
    type: "audio/mpeg",
  });

  const formData = new FormData();
  formData.append("file", fileBlob, "voicemail.mp3");
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
    console.warn("[voice-webhook] Transcription failed:", errorText);
    return null;
  }

  return res.text();
}

type SummaryResponse = {
  summary?: string;
  lead_title?: string | null;
  lead_description?: string | null;
  shouldCreateJob?: boolean;
  should_create_job?: boolean;
};

type OpenAIContentChunk = {
  type?: string;
  json?: unknown;
  text?: string[];
};

type OpenAIResponseBody = {
  output?: {
    content?: OpenAIContentChunk[];
  }[];
};

async function summarizeTranscript(transcript: string | null) {
  if (!transcript || !OPENAI_KEY) return null;

  const prompt = `
You are the AI dispatcher for a handyman service. Summarize the voicemail and decide if it warrants a new lead.
Return JSON with:
- summary: concise 2-3 sentence recap of the ask, including location/timing if mentioned.
- lead_title: short title for a job/lead if one should be created (e.g., "Fix leaking kitchen sink").
- lead_description: 2-4 sentences describing the work, pulling details from the voicemail.
- should_create_job: true if this is a real service request or callback, false if spam or empty.
Be succinct and avoid adding details not present in the transcript.
`.trim();

  const response = await fetch(`${OPENAI_ENDPOINT}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "text", text: prompt }],
        },
        {
          role: "user",
          content: [{ type: "text", text: transcript }],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.warn("[voice-webhook] AI summary request failed:", errorBody);
    return null;
  }

  const payload = (await response.json()) as OpenAIResponseBody;
  const parsed = parseSummaryResponse(payload);
  return parsed;
}

function parseSummaryResponse(payload: OpenAIResponseBody): SummaryResponse | null {
  const primary = payload?.output?.[0];
  const content = primary?.content;

  const jsonChunk = Array.isArray(content)
    ? content.find(
        (chunk: OpenAIContentChunk) =>
          chunk?.type === "output_json" || typeof chunk?.json === "object",
      )
    : undefined;

  if (jsonChunk?.json && typeof jsonChunk.json === "object") {
    return jsonChunk.json as SummaryResponse;
  }

  const textChunk = Array.isArray(content)
    ? content.find((chunk: OpenAIContentChunk) => Array.isArray(chunk?.text) && chunk.text.length > 0)
    : undefined;

  if (textChunk?.text?.[0]) {
    try {
      return JSON.parse(textChunk.text[0]) as SummaryResponse;
    } catch {
      return null;
    }
  }

  return null;
}

async function getWorkspaceIdForUser(supabase: SupabaseAdminClient, userId: string) {
  try {
    const { data } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1);

    const workspaceId = data?.[0]?.workspace_id as string | undefined;
    if (workspaceId) return workspaceId;

    const slug = await generateUniqueWorkspaceSlug({ supabase, name: "Workspace" });
    const { data: workspaceRow } = await supabase
      .from("workspaces")
      .insert({ owner_id: userId, name: "Workspace", slug })
      .select("id")
      .single();

    return (workspaceRow as { id: string } | null)?.id ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.warn("[voice-webhook] Unable to resolve workspace:", message);
    return null;
  }
}

async function getFirstUserId(supabase: SupabaseAdminClient) {
  try {
    const { data } = await supabase.auth.admin.listUsers({ perPage: 1 });
    const user = data?.users?.[0];
    return user?.id ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.warn("[voice-webhook] Unable to fetch default user:", message);
    return null;
  }
}

function normalizePhone(value: string | null) {
  if (!value) return null;
  return value.trim();
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

function parseTimestamp(raw: string | null) {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function truncateText(value: string, max = 240) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

type TwilioSignatureResult = {
  valid: boolean;
  reason?: string;
};

function validateTwilioSignature(req: NextRequest, formData: FormData): TwilioSignatureResult {
  if (!TWILIO_AUTH_TOKEN) {
    if (!twilioAuthTokenWarningLogged) {
      console.warn("[voice-webhook] TWILIO_AUTH_TOKEN not configured; skipping signature validation.");
      twilioAuthTokenWarningLogged = true;
    }
    return { valid: true };
  }

  const signature = req.headers.get(TWILIO_SIGNATURE_HEADER);
  if (!signature) {
    return { valid: false, reason: "missing Twilio signature header" };
  }

  const params = formDataToRecord(formData);
  try {
    const isValid = twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, req.url, params);
    return { valid: isValid, reason: isValid ? undefined : "signature mismatch" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "validation error";
    return { valid: false, reason };
  }
}

function formDataToRecord(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !(key in params)) {
      params[key] = value;
    }
  });
  return params;
}
