"use server";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
const GENERIC_AI_ERROR_MESSAGE =
  "We couldn’t generate an outbound call script. Please try again or write one manually.";

export type CallChannelSuggestion = "call" | "sms" | null;

export type OutboundCallScriptInput = {
  description?: string | null;
  status?: string | null;
  totalAmount?: number | null;
  daysSinceQuote?: number | null;
  jobId?: string | null;
  quoteId?: string | null;
  workspaceId?: string | null;
  customerName?: string | null;
  customerFirstName?: string | null;
};

export type OutboundCallScriptResult = {
  subject: string;
  opening: string;
  keyPoints: string[];
  closing: string;
  channelSuggestion: CallChannelSuggestion;
};

export type OutboundCallScriptErrorType = "ai_disabled" | "ai_error";

export type OutboundCallScriptActionResponse =
  | { ok: true; data: OutboundCallScriptResult }
  | { ok: false; error: OutboundCallScriptErrorType; message: string };

type ResponsesApiResult = {
  output?: Array<{
    content?: OpenAIContentChunk[];
  }>;
};

type OpenAIContentChunk = {
  type?: string;
  text?: string | string[];
};

// CHANGE: add logging helpers
function logCallScriptDebug(message: string, data?: unknown) {
  if (data !== undefined) {
    console.log("[call-script]", message, data);
    return;
  }
  console.log("[call-script]", message);
}

function logCallScriptMetrics(data: Record<string, unknown>) {
  console.log("[call-script-metrics]", data);
}

// CHANGE: add normalization helpers
function safeString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized: string[] = [];
  for (const item of value) {
    const candidate = safeString(item);
    if (candidate) {
      normalized.push(candidate);
    }
  }
  return normalized;
}

function normalizeChannelSuggestion(value: unknown): CallChannelSuggestion {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "call") {
      return "call";
    }
    if (normalized === "sms") {
      return "sms";
    }
  }
  return null;
}

function normalizeCallScriptResult(raw: unknown): OutboundCallScriptResult {
  const record =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

  const subject = safeString(record.subject) || "Call about your HandyBob quote";
  const opening =
    safeString(record.opening) || "Hello! I’m calling to follow up on your HandyBob quote.";
  const closing = safeString(record.closing) || "Let me know what works best for your schedule.";
  const keyPoints = safeStringArray(record.keyPoints);
  const channelSuggestion = normalizeChannelSuggestion(record.channelSuggestion);

  return {
    subject,
    opening,
    keyPoints,
    closing,
    channelSuggestion,
  };
}

function getOpenAiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key ? key : null;
}

function createSnippet(value: string): string {
  if (!value) {
    return "";
  }
  const maxLength = 80;
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength).trim()}…`;
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

function buildSystemPrompt(): string {
  return `
You are an outbound call script assistant for HandyBob. Return STRICT JSON with no explanation or markdown.
Respond with an object that matches exactly this shape: { "subject": string, "opening": string, "keyPoints": string[], "closing": string, "channelSuggestion": "call" | "sms" | null }.
subject, opening, and closing must be short, clear sentences. keyPoints should describe 2-4 talking points for the call. channelSuggestion must be "call", "sms", or null.
Do not wrap the JSON in markdown. Do not add extra keys.
`.trim();
}

function buildUserPrompt(input: OutboundCallScriptInput, description: string): string {
  const lines = [
    "Create a concise, structured outbound call script for HandyBob based on the context below.",
    "Focus on why we are calling, what to cover, and how to close the conversation.",
    `Quote / Job description:\n${description || "[not provided]"}`,
    `Customer name:\n${safeString(input.customerName) || "[not provided]"}`,
    `Customer first name:\n${safeString(input.customerFirstName) || "[not provided]"}`,
    `Quote status:\n${safeString(input.status) || "[not provided]"}`,
    `Total amount:\n${formatAmount(input.totalAmount)}`,
    `Days since quote:\n${formatNumber(input.daysSinceQuote)}`,
    `Job ID:\n${safeString(input.jobId) || "[not provided]"}`,
    `Quote ID:\n${safeString(input.quoteId) || "[not provided]"}`,
    `Workspace ID:\n${safeString(input.workspaceId) || "[not provided]"}`,
    "Use the information to tailor the subject, opening line, and closing, and produce a short bulleted list of key points for the call.",
    "If the quote appears recent or high-value, default the channelSuggestion to \"call\". Use \"sms\" only when the job is small or the customer prefers text. If you are not sure, emit null.",
    "Return only the JSON object specified by the system prompt.",
  ];
  return lines.join("\n\n");
}

function extractRawText(response: ResponsesApiResult): string | null {
  const firstOutput = response.output?.[0];
  if (!firstOutput) {
    return null;
  }
  const firstContent = firstOutput.content?.[0];
  if (!firstContent) {
    return null;
  }
  const { text } = firstContent;
  if (typeof text === "string") {
    return text.trim();
  }
  if (Array.isArray(text)) {
    const segments = text.map((segment) =>
      typeof segment === "string" ? segment : ""
    );
    return segments.join("").trim();
  }
  return null;
}

function parseJsonFromText(text: string): unknown | null {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sliced = text.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(sliced);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function smartOutboundCallScriptFromContext(
  input: OutboundCallScriptInput
): Promise<OutboundCallScriptActionResponse> {
  const startedAt = Date.now();
  const trimmedDescription = safeString(input.description);
  const descriptionSnippet = createSnippet(trimmedDescription);
  const totalAmount = typeof input.totalAmount === "number" ? input.totalAmount : null;
  const daysSinceQuote = typeof input.daysSinceQuote === "number" ? input.daysSinceQuote : null;

  logCallScriptDebug("smartOutboundCallScriptFromContext called", {
    descriptionSnippet,
    status: input.status,
    totalAmount,
    daysSinceQuote,
    jobId: input.jobId,
    quoteId: input.quoteId,
    workspaceId: input.workspaceId,
    customerName: input.customerName,
    customerFirstName: input.customerFirstName,
  });
  logCallScriptMetrics({
    event: "call_script_start",
    model: DEFAULT_MODEL,
    quoteId: input.quoteId,
    jobId: input.jobId,
    workspaceId: input.workspaceId,
  });

  const openAiKey = getOpenAiKey();
  logCallScriptDebug("env check", {
    hasKey: Boolean(openAiKey),
    model: DEFAULT_MODEL,
  });

  if (!openAiKey) {
    logCallScriptDebug("ai_disabled – missing env");
    logCallScriptMetrics({
      event: "call_script_error",
      reason: "missing_env",
      durationMs: Date.now() - startedAt,
      quoteId: input.quoteId,
      jobId: input.jobId,
      workspaceId: input.workspaceId,
    });
    return {
      ok: false,
      error: "ai_disabled",
      message: "Outbound call script generation is currently disabled.",
    };
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(input, trimmedDescription);
  const payload = {
    model: DEFAULT_MODEL,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: systemPrompt,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: userPrompt,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "text",
      },
      verbosity: "medium",
    },
  };

  try {
    logCallScriptDebug("about to call OpenAI", {
      model: DEFAULT_MODEL,
      payload: {
        model: payload.model,
        inputLength: payload.input.length,
      },
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
      const errorBody = await aiResponse.text();
      console.error("[call-script] OpenAI responded with non-OK status", {
        status: aiResponse.status,
        body: errorBody,
      });
      logCallScriptMetrics({
        event: "call_script_error",
        reason: "openai_non_ok",
        status: aiResponse.status,
        durationMs: Date.now() - startedAt,
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

    const body = (await aiResponse.json()) as ResponsesApiResult;
    logCallScriptDebug("raw OpenAI response captured");
    const rawText = extractRawText(body);

    if (!rawText) {
      console.error("[call-script] rawOutput was empty or missing");
      logCallScriptMetrics({
        event: "call_script_error",
        reason: "missing_output",
        durationMs: Date.now() - startedAt,
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

    const parsed = parseJsonFromText(rawText);
    if (parsed === null) {
      console.error("[call-script] unable to parse JSON from response", {
        rawText,
      });
      logCallScriptMetrics({
        event: "call_script_error",
        reason: "parse_failure",
        durationMs: Date.now() - startedAt,
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

    const normalized = normalizeCallScriptResult(parsed);
    logCallScriptDebug("smartOutboundCallScriptFromContext success", normalized);
    logCallScriptMetrics({
      event: "call_script_success",
      model: DEFAULT_MODEL,
      durationMs: Date.now() - startedAt,
      quoteId: input.quoteId,
      jobId: input.jobId,
      workspaceId: input.workspaceId,
      channelSuggestion: normalized.channelSuggestion,
    });
    return {
      ok: true,
      data: normalized,
    };
  } catch (error) {
    console.error("[call-script] unexpected error generating script", error);
    logCallScriptMetrics({
      event: "call_script_error",
      reason: "exception",
      durationMs: Date.now() - startedAt,
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
