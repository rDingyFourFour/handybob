import { createAdminClient } from "@/utils/supabase/admin";

const OPENAI_ENDPOINT = "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const OPENAI_KEY = process.env.OPENAI_API_KEY;

export type AiClassification = {
  ai_category: string | null;
  ai_urgency: string | null;
  ai_confidence: number | null;
};

type ClassificationArgs = {
  jobId: string;
  userId?: string;
  workspaceId?: string;
  title?: string | null;
  description?: string | null;
  transcript?: string | null;
  messages?: string | null;
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

const PROMPT = `
You classify handyman leads.
Return JSON with:
- category: one of [plumbing, electrical, carpentry, hvac, roofing, painting, landscaping, general, other].
- urgency: one of [emergency, this_week, flexible].
- confidence: number 0-1 expressing confidence in this classification.
Use only details provided. If unclear, pick "general" and "flexible" with low confidence.
`.trim();

export async function classifyJobWithAi(args: ClassificationArgs): Promise<AiClassification | null> {
  if (!OPENAI_KEY) {
    console.warn("[classifyJobWithAi] Missing OPENAI_API_KEY");
    return null;
  }

  const { jobId, userId, workspaceId, title, description, transcript, messages } = args;
  const supabase = createAdminClient();

  const inputText = [
    `Title: ${title ?? ""}`,
    `Description: ${description ?? ""}`,
    transcript ? `Call transcript: ${transcript}` : "",
    messages ? `Messages: ${messages}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(`${OPENAI_ENDPOINT}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      // Sends only job-specific text (title/description/transcript/messages) for this workspace/job; no cross-workspace data.
      input: [
        { role: "system", content: [{ type: "text", text: PROMPT }] },
        { role: "user", content: [{ type: "text", text: inputText }] },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.warn("[classifyJobWithAi] OpenAI error:", errorBody);
    return null;
  }

  const payload = (await response.json()) as OpenAIResponseBody;
  const parsed = parseClassification(payload);
  if (!parsed) return null;

  const { ai_category, ai_urgency, ai_confidence } = parsed;
  const { error } = await supabase
    .from("jobs")
    .update({
      ai_category,
      ai_urgency,
      ai_confidence,
    })
    .eq("id", jobId)
    .match({
      ...(workspaceId ? { workspace_id: workspaceId } : {}),
      ...(userId ? { user_id: userId } : {}),
    });

  if (error) {
    console.warn("[classifyJobWithAi] Failed to persist classification:", error.message);
    return parsed;
  }

  return parsed;
}

function parseClassification(payload: OpenAIResponseBody): AiClassification | null {
  const primary = payload?.output?.[0];
  const content = primary?.content;

  const jsonChunk = Array.isArray(content)
    ? content.find((chunk: OpenAIContentChunk) => chunk?.type === "output_json" || typeof chunk?.json === "object")
    : undefined;

  if (jsonChunk?.json && typeof jsonChunk.json === "object") {
    return normalize(jsonChunk.json as Record<string, unknown>);
  }

  const textChunk = Array.isArray(content)
    ? content.find((chunk: OpenAIContentChunk) => Array.isArray(chunk?.text) && chunk.text.length > 0)
    : undefined;

  if (textChunk?.text?.[0]) {
    try {
      return normalize(JSON.parse(textChunk.text[0]) as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  return null;
}

function normalize(raw: Record<string, unknown>): AiClassification | null {
  const ai_category = typeof raw.category === "string" ? raw.category : null;
  const ai_urgency = typeof raw.urgency === "string" ? raw.urgency : null;
  const ai_confidence = typeof raw.confidence === "number" ? raw.confidence : null;

  if (!ai_category && !ai_urgency) return null;
  return { ai_category, ai_urgency, ai_confidence };
}
