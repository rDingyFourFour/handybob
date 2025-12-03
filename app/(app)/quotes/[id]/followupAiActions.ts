"use server";

import {
  deriveFollowupRecommendationMetadata,
  type FollowupRecommendation,
} from "@/lib/domain/communications/followups";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";

export type SmartFollowupInput = {
  description: string;
  quoteId?: string | null;
  jobId?: string | null;
  workspaceId?: string | null;
  status?: string | null;
  totalAmount?: number | null;
  customerName?: string | null;
  daysSinceQuote?: number | null;
  outcome?: string | null;
};

export type SmartFollowupResult = {
  subject: string;
  body: string;
  channelSuggestion?: "sms" | "email" | null;
  recommendation?: FollowupRecommendation | null;
};

export type SmartFollowupErrorCode = "ai_disabled" | "ai_error";

export type SmartFollowupActionResponse =
  | { ok: true; data: SmartFollowupResult }
  | { ok: false; error: SmartFollowupErrorCode; message: string };

const GENERIC_AI_ERROR_MESSAGE =
  "We couldn’t generate a follow-up message. Please try again or write one manually.";

type ResponsesApiResult = {
  output?: Array<{
    content?: OpenAIContentChunk[];
  }>;
};

type OpenAIContentChunk = {
  type?: string;
  text?: string | string[];
};

function getTextFromResponse(response: ResponsesApiResult): string | null {
  try {
    console.log("[followup] full OpenAI response:", JSON.stringify(response, null, 2));
  } catch {
    console.log("[followup] full OpenAI response: [unable to serialize]");
  }

  const texts: string[] = [];
  for (const output of response.output ?? []) {
    for (const content of output.content ?? []) {
      if (content?.type !== "output_text") {
        continue;
      }
      const { text } = content;
      if (typeof text === "string" && text.trim()) {
        texts.push(text.trim());
        continue;
      }
      if (Array.isArray(text)) {
        for (const segment of text) {
          if (typeof segment === "string" && segment.trim()) {
            texts.push(segment.trim());
          }
        }
      }
    }
  }

  const joined = texts.join("\n").trim();
  if (!joined) {
    console.log("[followup] no text segment found in response");
    return null;
  }

  return joined;
}

function getOpenAiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key ? key : null;
}

function createSnippet(value: string): string {
  if (!value) {
    return "";
  }
  const max = 80;
  return value.length <= max ? value : `${value.slice(0, max).trim()}…`;
}

function buildSystemPrompt(): string {
  return `
You are a follow-up messaging assistant for HandyBob. Return STRICT JSON with no explanation.
Respond with an object that matches exactly this shape: { "subject": string, "body": string, "channelSuggestion": string | null }.
Do not wrap the JSON in markdown or add extra keys.
`.trim();
}

function buildUserPrompt(input: SmartFollowupInput, description: string): string {
  const lines = [
    "Create a concise, friendly follow-up message for a home services quote.",
    "Use the provided context to determine tone, specificity, and channel.",
    `Quote description:\n${description || "[no description provided]"}`,
    `Customer name:\n${input.customerName?.trim() || "[not provided]"}`,
    `Quote status:\n${input.status?.trim() || "[not provided]"}`,
    `Total amount:\n${formatAmount(input.totalAmount)}`,
    `Days since quote:\n${formatNumber(input.daysSinceQuote)}`,
    "Choose channelSuggestion based on the amount and recency: smaller jobs with more than three days since the quote often suit SMS; larger jobs or more formal estimates should favor email. If you are unsure, emit null.",
    "If channelSuggestion is \"sms\", keep the body to 1-2 sentences and under 320 characters. If it is \"email\", you can write 2-4 short paragraphs.",
    "Subject should feel personal and reference the quote, but stay concise.",
    "Return only the JSON object that fits the schema defined earlier.",
  ];
  return lines.join("\n\n");
}

function formatAmount(value?: number | null): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `$${value.toFixed(2)}`;
  }
  return "[not provided]";
}

function formatNumber(value?: number | null): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}`;
  }
  return "[not provided]";
}

function normalizeParsedFollowup(value: unknown): SmartFollowupResult {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const subject = normalizeSubject(record.subject);
  const body = normalizeBody(record.body);
  const channelSuggestion = normalizeChannelSuggestion(record.channelSuggestion);
  return {
    subject,
    body,
    channelSuggestion,
  };
}

function normalizeSubject(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "Quick follow-up on your quote";
}

function normalizeBody(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}

function normalizeChannelSuggestion(value: unknown): SmartFollowupResult["channelSuggestion"] {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "sms" || normalized === "email") {
      return normalized;
    }
  }
  return null;
}

export async function smartFollowupFromQuote(
  input: SmartFollowupInput
): Promise<SmartFollowupActionResponse> {
  const startedAt = Date.now();
  const trimmedDescription = input.description?.trim() ?? "";
  const descriptionSnippet = createSnippet(trimmedDescription);
  const descriptionLength = trimmedDescription.length;
  const totalAmount = typeof input.totalAmount === "number" ? input.totalAmount : null;
  const daysSinceQuote = typeof input.daysSinceQuote === "number" ? input.daysSinceQuote : null;

  console.log("[followup] smartFollowupFromQuote called", {
    descriptionSnippet,
    quoteId: input.quoteId,
    jobId: input.jobId,
    workspaceId: input.workspaceId,
    status: input.status,
    totalAmount,
    daysSinceQuote,
  });
  console.log("[followup-metrics]", {
    event: "followup_start",
    model: DEFAULT_MODEL,
    descriptionLength,
    quoteId: input.quoteId,
    jobId: input.jobId,
    workspaceId: input.workspaceId,
  });

  const openAiKey = getOpenAiKey();
  console.log("[followup] env check", {
    hasKey: Boolean(openAiKey),
    model: DEFAULT_MODEL,
  });
  if (!openAiKey) {
    console.log("[followup] env missing, disabling followup helper", {
      hasKey: false,
      model: DEFAULT_MODEL,
      quoteId: input.quoteId,
      jobId: input.jobId,
      workspaceId: input.workspaceId,
    });
    console.log("[followup-metrics]", {
      event: "followup_disabled",
      reason: "missing_env",
      model: DEFAULT_MODEL,
      durationMs: Date.now() - startedAt,
      quoteId: input.quoteId,
      jobId: input.jobId,
      workspaceId: input.workspaceId,
    });
    return {
      ok: false,
      error: "ai_disabled",
      message: "Smart follow-up is currently disabled.",
    };
  }

  const payload = {
    model: DEFAULT_MODEL,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: buildSystemPrompt(),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildUserPrompt(input, trimmedDescription),
          },
        ],
      },
    ],
    text: {
      format: { type: "text" },
      verbosity: "medium",
    },
  } as const;

  try {
    console.log("[followup] about to call OpenAI", {
      status: "requesting",
      model: DEFAULT_MODEL,
    });
    const aiResponse = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!aiResponse.ok) {
      const bodyText = await aiResponse.text();
      console.error("[followup] OpenAI responded with non-OK status", {
        status: aiResponse.status,
        body: bodyText,
      });
      console.log("[followup-metrics]", {
        event: "followup_error",
        errorType: "http_status",
        status: aiResponse.status,
        quoteId: input.quoteId,
        jobId: input.jobId,
        workspaceId: input.workspaceId,
      });
      return {
        ok: false,
        error: "ai_error",
        message: GENERIC_AI_ERROR_MESSAGE,
      };
    }

    const json = (await aiResponse.json()) as ResponsesApiResult;
    const rawOutput = getTextFromResponse(json);
    if (!rawOutput) {
      console.error("[followup] rawOutput was empty or null");
      console.log("[followup-metrics]", {
        event: "followup_error",
        errorType: "empty_output",
        model: DEFAULT_MODEL,
        quoteId: input.quoteId,
        jobId: input.jobId,
        workspaceId: input.workspaceId,
      });
      return {
        ok: false,
        error: "ai_error",
        message: GENERIC_AI_ERROR_MESSAGE,
      };
    }

    const firstBrace = rawOutput.indexOf("{");
    const lastBrace = rawOutput.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      console.error("[followup] rawOutput did not contain JSON braces", rawOutput);
      console.log("[followup-metrics]", {
        event: "followup_error",
        errorType: "json_braces_missing",
        model: DEFAULT_MODEL,
        quoteId: input.quoteId,
        jobId: input.jobId,
        workspaceId: input.workspaceId,
      });
      return {
        ok: false,
        error: "ai_error",
        message: GENERIC_AI_ERROR_MESSAGE,
      };
    }

    const jsonCandidate = rawOutput.slice(firstBrace, lastBrace + 1);
    console.log("[followup] rawOutput:", rawOutput);
    console.log("[followup] jsonCandidate:", jsonCandidate);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonCandidate);
    } catch (parseError) {
      console.error("[followup] JSON.parse failed for rawOutput", rawOutput, parseError);
      console.log("[followup-metrics]", {
        event: "followup_error",
        errorType: "parse_error",
        model: DEFAULT_MODEL,
        quoteId: input.quoteId,
        jobId: input.jobId,
        workspaceId: input.workspaceId,
      });
      return {
        ok: false,
        error: "ai_error",
        message: GENERIC_AI_ERROR_MESSAGE,
      };
    }

    const normalized = normalizeParsedFollowup(parsed);
    const recommendation = await deriveFollowupRecommendationMetadata({
      outcome: input.outcome ?? null,
      daysSinceQuote,
      modelChannelSuggestion: normalized.channelSuggestion ?? null,
    });
    normalized.recommendation = recommendation;

    if (!normalized.body) {
      console.error("[followup] normalized body was empty");
      console.log("[followup-metrics]", {
        event: "followup_error",
        errorType: "empty_body",
        model: DEFAULT_MODEL,
        quoteId: input.quoteId,
        jobId: input.jobId,
        workspaceId: input.workspaceId,
      });
      return {
        ok: false,
        error: "ai_error",
        message: GENERIC_AI_ERROR_MESSAGE,
      };
    }

    const durationMs = Date.now() - startedAt;
    console.log("[followup] success", {
      durationMs,
      descriptionLength,
      channelSuggestion: normalized.channelSuggestion ?? null,
      quoteId: input.quoteId,
      jobId: input.jobId,
      workspaceId: input.workspaceId,
    });
    console.log("[followup-metrics]", {
      event: "followup_success",
      model: DEFAULT_MODEL,
      durationMs,
      descriptionLength,
      channelSuggestion: normalized.channelSuggestion ?? null,
      quoteId: input.quoteId,
      jobId: input.jobId,
      workspaceId: input.workspaceId,
    });

    return { ok: true, data: normalized };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const normalizedError = error instanceof Error ? error : null;
    console.error("[followup] error while generating follow-up", {
      error,
      message: normalizedError?.message,
      stack: normalizedError?.stack,
    });
    console.log("[followup-metrics]", {
      event: "followup_error",
      errorType: "exception",
      model: DEFAULT_MODEL,
      durationMs,
      quoteId: input.quoteId,
      jobId: input.jobId,
      workspaceId: input.workspaceId,
    });
    return {
      ok: false,
      error: "ai_error",
      message: GENERIC_AI_ERROR_MESSAGE,
    };
  }
}
