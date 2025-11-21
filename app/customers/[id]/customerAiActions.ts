"use server";

import { buildCustomerTimelinePayload } from "@/utils/ai/customerTimelinePayload";
import { sendCustomerMessageEmail } from "@/utils/email/sendCustomerMessage";
import { sendCustomerSms } from "@/utils/sms/sendCustomerSms";
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/utils/workspaces";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses"; // OpenAI Responses API endpoint
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini"; // used for summaries + drafts

type CustomerSummaryState = {
  summary?: string;
  error?: string;
};

type CustomerCheckinDraftState = {
  subject?: string | null;
  body?: string | null;
  sms_body?: string | null;
  error?: string;
};

type SendState = {
  ok?: boolean;
  error?: string;
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

export async function generateCustomerSummary(
  _prev: CustomerSummaryState | null,
  formData: FormData,
): Promise<CustomerSummaryState> {
  const customerId = formData.get("customer_id");
  if (typeof customerId !== "string") return { error: "Customer ID is required." };

  try {
    const supabase = createServerClient();
    const { workspace } = await getCurrentWorkspace({ supabase });

    const payload = await buildCustomerTimelinePayload(customerId, workspace.id); // scoped to workspace + capped history

    const prompt = `
You are HandyBob's assistant. Summarize this customer relationship in 3–6 sentences:
- Number of jobs and common work types
- Tone of interactions
- Any visible payment behavior (fast/slow/none)
- Anything notable the contractor should know

Customer timeline data (JSON):
${JSON.stringify(payload)}
`.trim();

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
      }),
    });

    if (!aiResponse.ok) {
      const errorBody = await aiResponse.text();
      return { error: `OpenAI request failed: ${errorBody}` };
    }

    const body: OpenAIResponseBody = await aiResponse.json();
    const summary = extractText(body);
    return summary ? { summary } : { error: "No summary returned." };
  } catch (error) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Unexpected error while generating summary." };
  }
}

export async function generateCustomerCheckinDraft(
  _prev: CustomerCheckinDraftState | null,
  formData: FormData,
): Promise<CustomerCheckinDraftState> {
  const customerId = formData.get("customer_id");
  const channel = (formData.get("channel") || "email") as "email" | "sms";
  const tone = (formData.get("tone") || "").toString().trim();
  if (typeof customerId !== "string") return { error: "Customer ID is required." };

  try {
    const supabase = createServerClient();
    const { workspace } = await getCurrentWorkspace({ supabase });

    const payload = await buildCustomerTimelinePayload(customerId, workspace.id); // scoped to workspace + capped history
    const toneInstruction = tone ? `Tone: ${tone}.` : "";

    const prompt = `
You are HandyBob's assistant. Draft a friendly check-in / re-engagement message for this customer.
Channel: ${channel === "sms" ? "SMS" : "Email"}
${toneInstruction}

Customer history (JSON):
${JSON.stringify(payload)}

Respond in JSON with:
${channel === "sms" ? `{"sms_body": "text"}` : `{"subject": "short subject", "body": "email body"}`}
`.trim();

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

    const body: OpenAIResponseBody = await aiResponse.json();
    const draft = extractDraft(body);
    return draft ?? { error: "No draft returned." };
  } catch (error) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Unexpected error while drafting check-in." };
  }
}

export async function sendCustomerCheckinMessage(
  _prev: SendState | null,
  formData: FormData,
): Promise<SendState> {
  const channel = (formData.get("channel") || "email") as "email" | "sms";
  const to = (formData.get("to") || "").toString().trim();
  const subject = (formData.get("subject") || "").toString().trim() || null;
  const body = (formData.get("body") || "").toString().trim();
  const customerId = (formData.get("customer_id") || "").toString().trim() || null;

  if (!to || !body) return { error: "Recipient and message are required." };

  try {
    const supabase = createServerClient();
    const { workspace } = await getCurrentWorkspace({ supabase });

    let fromAddress: string | null = null;
    if (channel === "email") {
      fromAddress = (await sendCustomerMessageEmail({ to, subject: subject || undefined, body })) || null;
    } else {
      fromAddress = (await sendCustomerSms({ to, body })) || null;
    }

    const sentAt = new Date().toISOString();
    const { error: insertError } = await supabase.from("messages").insert({
      user_id: user.id,
      workspace_id: workspace.id,
      customer_id: customerId,
      job_id: null,
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
    return { error: "Failed to send message." };
  }
}

function extractText(payload: OpenAIResponseBody): string | null {
  const primaryOutput = payload?.output?.[0];
  const contentArray: OpenAIContentChunk[] = primaryOutput?.content ?? [];

  const textChunk = contentArray.find(
    (chunk) => Array.isArray(chunk?.text) && chunk.text.length > 0,
  );
  if (textChunk?.text?.[0]) {
    return String(textChunk.text[0]).trim();
  }

  if (typeof primaryOutput?.content?.[0]?.text?.[0] === "string") {
    return String(primaryOutput.content[0].text[0]).trim();
  }

  return null;
}

function extractDraft(payload: OpenAIResponseBody): CustomerCheckinDraftState | null {
  const primaryOutput = payload?.output?.[0];
  const contentArray: OpenAIContentChunk[] = primaryOutput?.content ?? [];

  const jsonChunk = contentArray.find(
    (chunk) =>
      chunk?.type === "output_json" ||
      chunk?.type === "json" ||
      typeof chunk?.json === "object",
  );

  if (jsonChunk?.json) {
    return normalizeDraft(jsonChunk.json as Record<string, unknown>);
  }

  const textChunk = contentArray.find(
    (chunk) => Array.isArray(chunk?.text) && chunk.text.length > 0,
  );

  if (textChunk?.text?.[0]) {
    try {
      return normalizeDraft(JSON.parse(textChunk.text[0]) as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  if (primaryOutput?.content?.[0]?.json) {
    return normalizeDraft(primaryOutput.content[0].json as Record<string, unknown>);
  }

  return null;
}

function normalizeDraft(raw: Record<string, unknown>): CustomerCheckinDraftState {
  const subject = typeof raw.subject === "string" ? raw.subject.trim() : null;
  const body = typeof raw.body === "string" ? raw.body.trim() : null;
  const sms_body = typeof raw.sms_body === "string" ? raw.sms_body.trim() : null;

  return { subject, body, sms_body };
}
