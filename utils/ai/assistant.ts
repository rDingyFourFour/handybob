// utils/ai/assistant.ts
const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

// JobSummary defines the structured payload we want an AI assistant to return for a job.
// - overview: short description in plain language of what the job is about.
// - key_events: ordered highlights like quote sent/accepted/paid, appointments scheduled/completed, invoice states, payments.
// - communication_patterns: notable behaviors inferred from messages (e.g., “customer is price-sensitive”, “prefers weekends”).
// - notes: optional freeform extra context.
export type JobSummary = {
  overview: string;
  key_events: {
    label: string;
    timestamp: string | null;
    status?: string | null;
    reference?: string | null;
  }[];
  communication_patterns: string[];
  notes?: string | null;
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

type RawAssistantReply = {
  summary?: unknown;
  follow_up_message?: unknown;
  next_actions?: unknown;
};

export type AssistantReply = {
  summary: string;
  follow_up_message: string;
  next_actions: string[];
};

function parseAssistantReply(payload: OpenAIResponseBody): AssistantReply {
  const primaryOutput = payload?.output?.[0];
  const contentArray: OpenAIContentChunk[] = primaryOutput?.content ?? [];

  const jsonChunk = contentArray.find(
    (chunk) =>
      chunk?.type === "output_json" ||
      chunk?.type === "json" ||
      typeof chunk?.json === "object"
  );

  if (jsonChunk?.json) {
    return normaliseAssistant(jsonChunk.json as RawAssistantReply);
  }

  const textChunk = contentArray.find(
    (chunk) => Array.isArray(chunk?.text) && chunk.text.length > 0
  );
  if (textChunk?.text?.[0]) {
    try {
      return normaliseAssistant(JSON.parse(textChunk.text[0]) as RawAssistantReply);
    } catch {
      throw new Error("OpenAI response text was not valid JSON.");
    }
  }

  if (primaryOutput?.content?.[0]?.json) {
    return normaliseAssistant(primaryOutput.content[0].json as RawAssistantReply);
  }

  throw new Error("Unable to parse assistant data from OpenAI response.");
}

function normaliseAssistant(raw: RawAssistantReply): AssistantReply {
  const summary =
    typeof raw.summary === "string" && raw.summary.trim().length > 0
      ? raw.summary.trim()
      : "No summary provided.";

  const followUp =
    typeof raw.follow_up_message === "string" && raw.follow_up_message.trim().length > 0
      ? raw.follow_up_message.trim()
      : "No follow-up message generated.";

  const rawActions =
    Array.isArray(raw.next_actions) && raw.next_actions.every((item) => typeof item === "string")
      ? (raw.next_actions as string[])
      : [];

  const nextActions = rawActions.length
    ? rawActions.map((action) => action.trim()).filter(Boolean)
    : ["No next actions suggested."];

  return {
    summary,
    follow_up_message: followUp,
    next_actions: nextActions,
  };
}

export async function requestAssistantReply(prompt: string): Promise<AssistantReply> {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

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
    throw new Error(`OpenAI request failed: ${errorBody}`);
  }

  const body: OpenAIResponseBody = await aiResponse.json();
  return parseAssistantReply(body);
}
