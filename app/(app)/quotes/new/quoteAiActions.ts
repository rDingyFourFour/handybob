"use server";

import { requireEnv } from "@/utils/env/base";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
type SmartQuoteInput = {
  description: string;
};

type SmartQuoteLineItem = {
  label: string;
  quantity: number;
  unitPrice: number;
};

export type SmartQuoteResult = {
  lineItems: SmartQuoteLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  clientMessage?: string;
};

type SmartQuoteSuccess = {
  ok: true;
  data: SmartQuoteResult;
};

type SmartQuoteError =
  | { ok: false; error: "ai_disabled"; message: string }
  | { ok: false; error: "ai_error"; message: string };

export type SmartQuoteActionResponse = SmartQuoteSuccess | SmartQuoteError;

type ResponsesApiResult = {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string | string[];
    }>;
  }>;
};

function getTextFromResponse(response: ResponsesApiResult): string | null {
  try {
    console.log("[smart-quote] full OpenAI response:", JSON.stringify(response, null, 2));
  } catch {
    console.log("[smart-quote] full OpenAI response: [unable to serialize]");
  }

  const texts: string[] = [];
  for (const output of response.output ?? []) {
    for (const content of output.content ?? []) {
      if (content?.type !== "output_text") continue;
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
    console.log("[smart-quote] no text segment found in response");
    return null;
  }

  return joined;
}

export async function smartQuoteFromDescription({
  description,
}: SmartQuoteInput): Promise<SmartQuoteActionResponse> {
  console.log("[smart-quote] smartQuoteFromDescription called with input:", {
    description,
  });
  const startedAt = Date.now();
  const inputSummary = `${description.slice(0, 60)}${description.length > 60 ? "…" : ""}`;
  console.log("[smart-quote-metrics]", {
    event: "smart_quote_start",
    inputSummary,
    model: DEFAULT_MODEL,
    descriptionLength: description.length,
  });
  const trimmedDescription = description?.trim() ?? "";
  if (!trimmedDescription) {
    return {
      ok: false,
      error: "ai_error",
      message: "A description is required for smart quote generation.",
    };
  }

  const openAiKey = getOpenAiKey();
  console.log("[smart-quote] env check", {
    hasKey: Boolean(openAiKey),
    model: DEFAULT_MODEL,
  });
  if (!openAiKey) {
    console.log("[smart-quote] env missing, returning ai_disabled");
    console.log("[smart-quote-metrics]", {
      event: "smart_quote_disabled",
      reason: "missing_env",
      model: DEFAULT_MODEL,
      durationMs: Date.now() - startedAt,
    });
    return {
      ok: false,
      error: "ai_disabled",
      message: "Smart quote generation is currently disabled.",
    };
  }

  const promptText = buildPrompt(trimmedDescription);

  try {
    console.log("[smart-quote] about to call OpenAI");
    const aiResponse = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: `
You are a quoting assistant for a handyman business. Given a plain-English job description, respond with STRICT JSON ONLY, no backticks, no prose.
The JSON must exactly follow this shape: { "subtotal": number, "tax": number, "total": number,
"lineItems": Array<{ "label": string, "amount": number }>, "clientMessage": string | null }.
Do not wrap the JSON in any markdown, and do not add explanatory text.
`.trim(),
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: promptText,
              },
            ],
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorBody = await aiResponse.text();
      return {
        ok: false,
        error: "ai_error",
        message: `OpenAI request failed: ${errorBody}`,
      };
    }

    const body = (await aiResponse.json()) as ResponsesApiResult;
    const rawOutput = getTextFromResponse(body);

    if (!rawOutput) {
      console.error("[smart-quote] rawOutput was empty or null");
      return {
        ok: false,
        error: "ai_error",
        message: "We couldn’t generate a quote. Please try again or fill in details manually.",
      };
    }

    const firstBrace = rawOutput.indexOf("{");
    const lastBrace = rawOutput.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      console.error("[smart-quote] rawOutput did not contain JSON braces", rawOutput);
      return {
        ok: false,
        error: "ai_error",
        message: "We couldn’t generate a quote. Please try again or fill in details manually.",
      };
    }

    const jsonCandidate = rawOutput.slice(firstBrace, lastBrace + 1);
    console.log("[smart-quote] rawOutput:", rawOutput);
    console.log("[smart-quote] jsonCandidate:", jsonCandidate);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonCandidate);
    } catch (parseError) {
      console.error("[smart-quote] JSON.parse failed for rawOutput:", rawOutput, parseError);
      return {
        ok: false,
        error: "ai_error",
        message: "We couldn’t generate a quote. Please try again or fill in details manually.",
      };
    }

    let normalized: SmartQuoteResult;
    try {
      normalized = normalizeParsedQuote(parsed);
    } catch (normalizeError) {
      console.error("[smart-quote] failed to normalize parsed quote:", normalizeError);
      return {
        ok: false,
        error: "ai_error",
        message: "We couldn’t generate a quote. Please try again or fill in details manually.",
      };
    }

    const durationMs = Date.now() - startedAt;
    console.log("[smart-quote-metrics]", {
      event: "smart_quote_success",
      model: DEFAULT_MODEL,
      durationMs,
      lineItemsCount: normalized.lineItems.length,
      subtotal: normalized.subtotal,
      tax: normalized.tax,
      total: normalized.total,
    });
    return { ok: true, data: normalized };
  } catch (error) {
    const aiErrorMessage =
      "We couldn’t generate a quote. Please try again or fill in details manually.";
    console.error("[smart-quote] ai_error – unexpected failure", error, (error as Error)?.message);
    console.log("[smart-quote-metrics]", {
      event: "smart_quote_error",
      model: DEFAULT_MODEL,
      durationMs: Date.now() - startedAt,
      errorType: "unexpected_error",
      errorMessageShort:
        error instanceof Error ? error.message.slice(0, 120) : "unknown error",
    });
    return { ok: false, error: "ai_error", message: aiErrorMessage };
  }
}

function getOpenAiKey(): string | null {
  try {
    return requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY);
  } catch {
    return null;
  }
}

function buildPrompt(description: string) {
  return `
You are an assistant that generates simple handyman job quotes.
Given the following job description, respond with ONLY a JSON object with this exact shape:
{ "lineItems": Array<{ "label": string, "amount": number }>, "subtotal": number, "tax": number, "total": number, "clientMessage": string | null }
Do not include any extra text, no explanations, no backticks, and no additional keys; respond with ONLY the JSON.
Job description:
${description}
Again, respond with ONLY the JSON object.
`.trim();
}

function normalizeParsedQuote(value: unknown): SmartQuoteResult {
  if (!value || typeof value !== "object") {
    throw new Error("Parsed quote is not an object.");
  }
  const record = value as Record<string, unknown>;
  const rawLineItems = Array.isArray(record.lineItems) ? record.lineItems : [];
  const lineItems: SmartQuoteLineItem[] = rawLineItems
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const inner = item as Record<string, unknown>;
      const label =
        typeof inner.label === "string" && inner.label.trim() ? inner.label.trim() : "";
      const amount = parseFiniteNumber(inner.amount);
      if (!label || amount === null) return null;
      return { label, quantity: 1, unitPrice: amount };
    })
    .filter((item): item is SmartQuoteLineItem => item !== null);

  if (lineItems.length === 0) {
    throw new Error("AI response did not include any valid line items.");
  }

  const subtotal = coerceNumberToZero(record.subtotal);
  const tax = coerceNumberToZero(record.tax);
  const total = coerceNumberToZero(record.total);
  const clientMessage =
    typeof record.clientMessage === "string" && record.clientMessage.trim()
      ? record.clientMessage.trim()
      : null;

  const normalizedResult: SmartQuoteResult = {
    lineItems,
    subtotal,
    tax,
    total,
    clientMessage: clientMessage ?? undefined,
  };

  console.log("[smart-quote] normalized SmartQuoteResult:", normalizedResult);
  return normalizedResult;
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    const numeric = Number(normalized);
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

function coerceNumberToZero(value: unknown): number {
  const parsed = parseFiniteNumber(value);
  if (parsed === null) {
    return 0;
  }
  return parsed < 0 ? 0 : parsed;
}
