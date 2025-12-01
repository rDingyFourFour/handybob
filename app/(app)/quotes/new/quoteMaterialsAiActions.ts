"use server";

import { requireEnv } from "@/utils/env/base";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";

export type MaterialsListInput = {
  description: string;
  lineItems?: unknown[] | null;
  jobId?: string | null;
  workspaceId?: string | null;
};

export type MaterialsListItem = {
  label: string;
  quantity: string;
  notes?: string | null;
};

export type MaterialsListResult = {
  items: MaterialsListItem[];
};

export type MaterialsListErrorCode = "ai_disabled" | "ai_error";

export type MaterialsListActionResponse =
  | { ok: true; data: MaterialsListResult }
  | { ok: false; error: MaterialsListErrorCode; message: string };

const GENERIC_AI_ERROR_MESSAGE =
  "We couldn’t generate a materials list. Please try again or fill it in manually.";

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
    console.log("[materials] full OpenAI response:", JSON.stringify(response, null, 2));
  } catch (error) {
    console.log("[materials] full OpenAI response: [unable to serialize]", error);
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
    console.log("[materials] no text segment found in response");
    return null;
  }
  return joined;
}

function getOpenAiKey(): string | null {
  try {
    return requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY);
  } catch {
    return null;
  }
}

function buildSystemPrompt() {
  return `
You are a materials list assistant for HandyBob. Focus strictly on producing a JSON object with no markdown or extra explanation.
Return exactly this shape: { "items": [ { "label": string, "quantity": string, "notes": string | null } ] }.
The list should describe only materials required for the job, never labor or scheduling details.
Limit the list to 5-20 concise entries, and do not add any keys beyond those defined above.
`.trim();
}

function buildPrompt(description: string, lineItemsSummary: string | null) {
  const parts = [
    "Use the job details below to create a compact materials checklist.",
    "Respond with STRICT JSON matching the schema and do not wrap it in prose.",
    `Job description:\n${description || "[no description provided]"}`,
  ];
  if (lineItemsSummary) {
    parts.push(`Line items summary:\n${lineItemsSummary}`);
  }
  return parts.join("\n\n");
}

function createLineItemsSummary(lineItems?: unknown[] | null): string | null {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return null;
  }
  const summaries: string[] = [];
  for (const entry of lineItems) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const label = firstNonEmptyString(record, ["label", "name", "description", "scope"]);
    if (!label) {
      continue;
    }
    const quantity = formatQuantityLike(firstNonNullValue(record, ["quantity", "qty", "count", "amount"]));
    const unitPrice = formatUnitPriceLike(firstNonNullValue(record, ["unitPrice", "unit_price", "price"]));
    const details: string[] = [];
    if (quantity) {
      details.push(`${quantity} qty`);
    }
    if (unitPrice) {
      details.push(`x ${unitPrice}`);
    }
    if (details.length) {
      summaries.push(`${label} – ${details.join(" ")}`);
    } else {
      summaries.push(label);
    }
  }
  if (!summaries.length) {
    return null;
  }
  return summaries.join("\n");
}

function firstNonEmptyString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
}

function firstNonNullValue(record: Record<string, unknown>, keys: string[]): unknown | null {
  for (const key of keys) {
    if (key in record) {
      const value = record[key];
      if (value !== null && value !== undefined) {
        return value;
      }
    }
  }
  return null;
}

function formatQuantityLike(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    return Number.isInteger(value) ? `${value}` : value.toFixed(2);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
}

function formatUnitPriceLike(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    return `$${value.toFixed(2)}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function toNormalizedString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function normalizeParsedMaterials(value: unknown): MaterialsListResult {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const itemsRaw = Array.isArray(record.items) ? record.items : [];
  const normalizedItems: MaterialsListItem[] = itemsRaw
    .map((item) => normalizeMaterialItem(item))
    .filter((item): item is MaterialsListItem => item !== null);
  return { items: normalizedItems };
}

function normalizeMaterialItem(item: unknown): MaterialsListItem | null {
  if (!item || typeof item !== "object") {
    return null;
  }
  const record = item as Record<string, unknown>;
  const label = firstNonEmptyString(record, ["label", "name"]);
  if (!label) {
    return null;
  }
  const quantity = toNormalizedString(record.quantity ?? record.qty ?? record.amount ?? "");
  const notesRaw = record.notes ?? record.note;
  const notes = toNormalizedString(notesRaw);
  return {
    label,
    quantity,
    notes: notes || null,
  };
}

export async function smartMaterialsForQuote(
  input: MaterialsListInput
): Promise<MaterialsListActionResponse> {
  const startedAt = Date.now();
  const descriptionSnippet = input.description?.slice(0, 80) ?? "";
  console.log("[materials] smartMaterialsForQuote called", {
    descriptionSnippet,
    hasLineItems: Array.isArray(input.lineItems),
    jobId: input.jobId,
    workspaceId: input.workspaceId,
  });
  const trimmedDescription = input.description?.trim() ?? "";
  console.log("[materials-metrics]", {
    event: "materials_start",
    model: DEFAULT_MODEL,
    descriptionLength: trimmedDescription.length,
    jobId: input.jobId,
    workspaceId: input.workspaceId,
  });

  const openAiKey = getOpenAiKey();
  console.log("[materials] env check", {
    hasKey: Boolean(openAiKey),
    model: DEFAULT_MODEL,
  });
  if (!openAiKey) {
    console.log("[materials] env missing, disabling materials helper", {
      hasKey: false,
      model: DEFAULT_MODEL,
    });
    return {
      ok: false,
      error: "ai_disabled",
      message: "Materials helper is currently disabled.",
    };
  }

  const lineItemsSummary = createLineItemsSummary(input.lineItems);
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
            text: buildPrompt(trimmedDescription, lineItemsSummary),
          },
        ],
      },
    ],
  } as const;

  try {
    console.log("[materials] about to call OpenAI", {
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
      console.error("[materials] OpenAI responded with non-OK status", {
        status: aiResponse.status,
        body: bodyText,
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
      console.error("[materials] rawOutput was empty or null");
      return {
        ok: false,
        error: "ai_error",
        message: GENERIC_AI_ERROR_MESSAGE,
      };
    }

    const firstBrace = rawOutput.indexOf("{");
    const lastBrace = rawOutput.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      console.error("[materials] rawOutput did not contain JSON braces", rawOutput);
      return {
        ok: false,
        error: "ai_error",
        message: GENERIC_AI_ERROR_MESSAGE,
      };
    }

    const jsonCandidate = rawOutput.slice(firstBrace, lastBrace + 1);
    console.log("[materials] jsonCandidate:", jsonCandidate);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonCandidate);
    } catch (parseError) {
      console.error("[materials] JSON.parse failed for rawOutput", rawOutput, parseError);
      return {
        ok: false,
        error: "ai_error",
        message: GENERIC_AI_ERROR_MESSAGE,
      };
    }

    const result = normalizeParsedMaterials(parsed);
    const durationMs = Date.now() - startedAt;
    console.log("[materials] success", {
      durationMs,
      descriptionLength: trimmedDescription.length,
      itemCount: result.items.length,
      jobId: input.jobId,
      workspaceId: input.workspaceId,
    });
    console.log("[materials-metrics]", {
      event: "materials_success",
      model: DEFAULT_MODEL,
      durationMs,
      descriptionLength: trimmedDescription.length,
      itemCount: result.items.length,
      jobId: input.jobId,
      workspaceId: input.workspaceId,
    });

    return { ok: true, data: result };
  } catch (error) {
    const normalizedError = error instanceof Error ? error : null;
    const errorMessage = normalizedError?.message ?? String(error);
    console.error("[materials] error while generating materials", {
      error,
      message: errorMessage,
      stack: normalizedError?.stack,
    });
    console.log("[materials-metrics]", {
      event: "materials_error",
      model: DEFAULT_MODEL,
      errorMessage,
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
