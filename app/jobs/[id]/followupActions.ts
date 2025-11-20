"use server";

import { buildJobTimelinePayload } from "@/utils/ai/jobTimelinePayload";
import { sendCustomerMessageEmail } from "@/utils/email/sendCustomerMessage";
import { sendCustomerSms } from "@/utils/sms/sendCustomerSms";
import { createServerClient } from "@/utils/supabase/server";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses"; // OpenAI Responses API endpoint
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini"; // JSON responses, fast/cheap

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

type FollowupDraftState = {
  subject?: string | null;
  body?: string | null;
  sms_body?: string | null;
  error?: string;
};

type SendFollowupState = {
  ok?: boolean;
  error?: string;
};

const GOAL_LABELS: Record<string, string> = {
  follow_up_after_sending_quote: "Follow up after sending a quote",
  follow_up_on_unanswered_message: "Follow up on unanswered message",
  confirm_upcoming_appointment: "Confirm upcoming appointment",
  follow_up_after_completion: "Follow up after work is complete",
};

export async function generateFollowupDraft(
  _prev: FollowupDraftState | null,
  formData: FormData,
): Promise<FollowupDraftState> {
  const jobId = formData.get("job_id");
  const goal = formData.get("goal") || "follow_up_after_sending_quote";
  const channel = (formData.get("channel") || "email") as "email" | "sms";
  const tone = (formData.get("tone") || "").toString().trim();

  if (typeof jobId !== "string") {
    return { error: "Job ID is required." };
  }

  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You must be signed in." };

    const timelinePayload = await buildJobTimelinePayload(jobId, user.id); // already scoped + truncated
    const goalLabel = GOAL_LABELS[String(goal)] ?? "Follow up after sending a quote";
    const toneInstruction = tone ? `Tone: ${tone}.` : "";

    const prompt = `
You are HandyBob's follow-up copilot. Given job + customer history and a goal, draft a message the contractor can send.

Goal: ${goalLabel}
Channel: ${channel === "sms" ? "SMS" : "Email"}
${toneInstruction}

Job and customer context (JSON):
${JSON.stringify(timelinePayload)}

Respond in JSON with:
${channel === "sms" ? `{"sms_body": "text"}` : `{"subject": "short subject", "body": "email body"}`}

Keep it clear, concise, and actionable. Do not include greetings that conflict with the tone. Avoid overpromising. Never send until the contractor confirms.`.trim();

    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) return { error: "OPENAI_API_KEY is not configured." };

    const aiResponse = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: prompt,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errorBody = await aiResponse.text();
      return { error: `OpenAI request failed: ${errorBody}` };
    }

    const parsed = (await aiResponse.json()) as OpenAIResponseBody;
    const draft = extractDraft(parsed);
    if (!draft) return { error: "No draft returned." };
    return draft;
  } catch (error) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Unexpected error while generating follow-up." };
  }
}

export async function sendFollowupMessage(
  _prev: SendFollowupState | null,
  formData: FormData,
): Promise<SendFollowupState> {
  const channel = (formData.get("channel") || "email") as "email" | "sms";
  const to = (formData.get("to") || "").toString().trim();
  const subject = (formData.get("subject") || "").toString().trim() || null;
  const body = (formData.get("body") || "").toString().trim();
  const jobId = (formData.get("job_id") || "").toString().trim() || null;
  const customerId = (formData.get("customer_id") || "").toString().trim() || null;

  if (!to || !body) {
    return { error: "Recipient and message are required." };
  }

  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You must be signed in." };

    let fromAddress: string | null = null;
    if (channel === "email") {
      fromAddress = (await sendCustomerMessageEmail({ to, subject: subject || undefined, body })) || null;
    } else {
      fromAddress = (await sendCustomerSms({ to, body })) || null;
    }

    const sentAt = new Date().toISOString();
    const { error: insertError } = await supabase.from("messages").insert({
      user_id: user.id,
      customer_id: customerId || null,
      job_id: jobId,
      quote_id: null,
      invoice_id: null,
      direction: "outbound",
      via: channel,
      channel,
      to_address: to,
      from_address: fromAddress,
      subject: channel === "email" ? subject : null,
      body,
      sent_at: sentAt,
      created_at: sentAt,
    });

    if (insertError) {
      return { error: insertError.message };
    }

    return { ok: true };
  } catch (error) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to send follow-up." };
  }
}

function extractDraft(payload: OpenAIResponseBody): FollowupDraftState | null {
  const primary = payload?.output?.[0];
  const content = primary?.content;

  const jsonChunk = Array.isArray(content)
    ? content.find(
        (chunk: OpenAIContentChunk) =>
          chunk?.type === "output_json" ||
          chunk?.type === "json" ||
          typeof chunk?.json === "object",
      )
    : undefined;

  if (jsonChunk?.json) {
    return normalizeDraft(jsonChunk.json);
  }

  const textChunk = Array.isArray(content)
    ? content.find((chunk: OpenAIContentChunk) => Array.isArray(chunk?.text) && chunk.text.length > 0)
    : undefined;

  if (textChunk?.text?.[0]) {
    try {
      return normalizeDraft(JSON.parse(textChunk.text[0]) as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  if (primary?.content?.[0]?.json) {
    return normalizeDraft(primary.content[0].json as Record<string, unknown>);
  }

  return null;
}

function normalizeDraft(raw: Record<string, unknown>): FollowupDraftState {
  return {
    subject: typeof raw.subject === "string" ? raw.subject.trim() : null,
    body: typeof raw.body === "string" ? raw.body.trim() : null,
    sms_body: typeof raw.sms_body === "string" ? raw.sms_body.trim() : null,
  };
}
