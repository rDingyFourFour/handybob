"use server";

import { requireEnv } from "@/utils/env/base";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
const VALID_STATUS_SUGGESTIONS = ["lead", "scheduled", "in_progress", "complete"] as const;

export type SmartJobIntakeInput = {
  description: string;
  jobId?: string;
  workspaceId?: string;
};

export type SmartJobIntakeResult = {
  title: string;
  notes: string;
  statusSuggestion?: (typeof VALID_STATUS_SUGGESTIONS)[number] | null;
};

export type SmartJobIntakeActionResponse =
  | { ok: true; data: SmartJobIntakeResult }
  | {
      ok: false;
      error: "ai_disabled" | "ai_error";
      message: string;
    };

const GENERIC_AI_ERROR_MESSAGE =
  "We couldn’t suggest job details. Please try again or fill them in manually.";

type JobStatusSuggestion = (typeof VALID_STATUS_SUGGESTIONS)[number];

type ResponsesApiResult = {
  output?: Array<{
    content?: OpenAIContentChunk[];
  }>;
};

type OpenAIContentChunk = {
  type?: string;
  json?: unknown;
  text?: string | string[];
};

function getTextFromResponse(response: ResponsesApiResult): string | null {
  try {
    console.log("[job-intake] full OpenAI response:", JSON.stringify(response, null, 2));
  } catch {
    console.log("[job-intake] full OpenAI response: [unable to serialize]");
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
    console.log("[job-intake] no text segment found in response");
    return null;
  }

  return joined;
}

export async function smartJobIntakeFromDescription({
  description,
  jobId,
  workspaceId,
}: SmartJobIntakeInput): Promise<SmartJobIntakeActionResponse> {
  const startedAt = Date.now();
  const trimmedDescription = description?.trim() ?? "";
  const snippet = createSnippet(trimmedDescription);
  console.log("[job-intake] smartJobIntakeFromDescription called", {
    descriptionSnippet: snippet,
    jobId,
    workspaceId,
  });
  console.log("[job-intake-metrics]", {
    event: "job_intake_start",
    model: DEFAULT_MODEL,
    descriptionLength: trimmedDescription.length,
    jobId,
    workspaceId,
  });

  if (!trimmedDescription) {
    return {
      ok: false,
      error: "ai_error",
      message: "A description is required for smart job intake.",
    };
  }

  const openAiKey = getOpenAiKey();
  console.log("[job-intake] env check", {
    hasKey: Boolean(openAiKey),
    model: DEFAULT_MODEL,
  });

  if (!openAiKey) {
    console.log("[job-intake] ai_disabled – missing env");
    console.log("[job-intake-metrics]", {
      event: "job_intake_disabled",
      reason: "missing_env",
      model: DEFAULT_MODEL,
      durationMs: Date.now() - startedAt,
      jobId,
      workspaceId,
    });
    return {
      ok: false,
      error: "ai_disabled",
      message: "Smart Job Intake is currently disabled.",
    };
  }

  const systemPrompt = buildSystemPrompt();
  const promptText = buildPrompt(trimmedDescription);
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
            text: promptText,
          },
        ],
      },
    ],
  };

  try {
    console.log("[job-intake] about to call OpenAI", {
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
      const errorBody = await aiResponse.text();
      console.error("[job-intake] OpenAI responded with non-OK status", {
        status: aiResponse.status,
        body: errorBody,
      });
      return {
        ok: false,
        error: "ai_error",
        message: GENERIC_AI_ERROR_MESSAGE,
      };
    }

    const body = (await aiResponse.json()) as ResponsesApiResult;
    const rawOutput = getTextFromResponse(body);

    if (!rawOutput) {
      console.error("[job-intake] rawOutput was empty or null");
      return {
        ok: false,
        error: "ai_error",
        message: GENERIC_AI_ERROR_MESSAGE,
      };
    }

    const firstBrace = rawOutput.indexOf("{");
    const lastBrace = rawOutput.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      console.error("[job-intake] rawOutput did not contain JSON braces", rawOutput);
      return {
        ok: false,
        error: "ai_error",
        message: GENERIC_AI_ERROR_MESSAGE,
      };
    }

    const jsonCandidate = rawOutput.slice(firstBrace, lastBrace + 1);
    console.log("[job-intake] rawOutput:", rawOutput);
    console.log("[job-intake] jsonCandidate:", jsonCandidate);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonCandidate);
    } catch (parseError) {
      console.error("[job-intake] JSON.parse failed for rawOutput:", rawOutput, parseError);
      return {
        ok: false,
        error: "ai_error",
        message: GENERIC_AI_ERROR_MESSAGE,
      };
    }

    const parsedRecord = parsed as Record<string, unknown>;
    const statusSuggestionProvided = hasStatusSuggestion(parsedRecord);
    let normalized: SmartJobIntakeResult;
    try {
      normalized = normalizeParsedResult(parsedRecord);
    } catch (normalizeError) {
      console.error("[job-intake] failed to normalize parsed job intake result:", normalizeError);
      return {
        ok: false,
        error: "ai_error",
        message: GENERIC_AI_ERROR_MESSAGE,
      };
    }

    const durationMs = Date.now() - startedAt;
    console.log("[job-intake] success", {
      durationMs,
      descriptionLength: trimmedDescription.length,
      statusSuggestion: normalized.statusSuggestion ?? null,
      statusSuggestionProvided,
      jobId,
      workspaceId,
    });
    console.log("[job-intake-metrics]", {
      event: "job_intake_success",
      model: DEFAULT_MODEL,
      durationMs,
      descriptionLength: trimmedDescription.length,
      statusSuggestionProvided,
      jobId,
      workspaceId,
    });

    return { ok: true, data: normalized };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error("[job-intake] ai_error – unexpected failure", error);
    console.log("[job-intake-metrics]", {
      event: "job_intake_error",
      model: DEFAULT_MODEL,
      durationMs,
      errorType: "unexpected_error",
      errorMessageShort:
        error instanceof Error ? error.message.slice(0, 120) : "unknown error",
      jobId,
      workspaceId,
    });
    return {
      ok: false,
      error: "ai_error",
      message: GENERIC_AI_ERROR_MESSAGE,
    };
  }
}

function normalizeParsedResult(value: Record<string, unknown>): SmartJobIntakeResult {
  const title = normalizeTitle(value.title);
  const notes = normalizeNotes(value.notes);
  const statusSuggestion = normalizeStatus(value.statusSuggestion);

  return {
    title,
    notes,
    statusSuggestion,
  };
}

function hasStatusSuggestion(value: Record<string, unknown>): boolean {
  const candidate = value.statusSuggestion;
  return (
    typeof candidate === "string" &&
    VALID_STATUS_SUGGESTIONS.includes(candidate as JobStatusSuggestion)
  );
}

function normalizeTitle(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed.length <= 60 ? trimmed : trimmed.slice(0, 60).trim();
    }
  }
  return "New job";
}

function normalizeNotes(value: unknown): string {
  if (typeof value === "string") {
    const collapsed = value.trim().replace(/\s+/g, " ");
    if (collapsed) {
      return collapsed;
    }
  }
  return "";
}

function normalizeStatus(value: unknown): JobStatusSuggestion {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (VALID_STATUS_SUGGESTIONS.includes(normalized as JobStatusSuggestion)) {
      return normalized as JobStatusSuggestion;
    }
  }
  return "lead";
}

function buildPrompt(description: string) {
  return `
Provide a JSON object only. Respond with absolutely no markdown, backticks, or extraneous text.
Return an object with these keys:
- title: A short, human-readable job title (40 characters or fewer).
- notes: One to three short bullet-style sentences or lines describing the work scope, still as a single string.
- statusSuggestion: One of ["lead","scheduled","in_progress","complete"] based on the description, default to "lead" if unsure.
Job description:
${description}
`.trim();
}

function createSnippet(value: string) {
  if (!value) {
    return "";
  }
  const max = 60;
  return value.length <= max ? value : `${value.slice(0, max).trim()}…`;
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
You are a job intake assistant for HandyBob. Given a plain-English job description, reply with STRICT JSON ONLY, no markdown or prose.
The JSON must follow this exact shape: { "title": string, "notes": string, "statusSuggestion": string | null }.
Keep titles under 40 characters and notes to 1-3 short bullet-like sentences.
Use one of "lead", "scheduled", "in_progress", or "complete" for statusSuggestion.
`.trim();
}

export async function requestSmartJobIntake(input: SmartJobIntakeInput) {
  return await smartJobIntakeFromDescription(input);
}
