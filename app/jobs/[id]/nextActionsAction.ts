"use server";

import { buildJobTimelinePayload } from "@/utils/ai/jobTimelinePayload";
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/utils/workspaces";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses"; // OpenAI Responses API
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini"; // JSON-style responses, fast

type NextActionsState = {
  next_actions?: string[];
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

export async function generateNextActions(
  _prev: NextActionsState | null,
  formData: FormData,
): Promise<NextActionsState> {
  const jobId = formData.get("job_id");
  if (typeof jobId !== "string") return { error: "Job ID is required." };

  try {
    const supabase = createServerClient();
    const { workspace } = await getCurrentWorkspace({ supabase });

    const payload = await buildJobTimelinePayload(jobId, workspace.id);
    // payload is already trimmed (events capped, text truncated) and scoped to this workspace/job to avoid leaking other users' data.

    const prompt = `
Given this job's history, list the top 3 most important next actions the contractor should take.
- Each should be concise and actionable (e.g., "Send follow-up about quote", "Schedule appointment to perform work", "Send invoice").
- Return JSON: {"next_actions": ["item 1", "item 2", "item 3"]}
- Do not include anything that changes status, schedules automatically, or sends messages. These are suggestions only.

Job data (JSON):
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
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errorBody = await aiResponse.text();
      return { error: `OpenAI request failed: ${errorBody}` };
    }

    const responseBody = (await aiResponse.json()) as OpenAIResponseBody;
    const actions = extractNextActions(responseBody);
    if (!actions.length) return { error: "No next actions returned." };
    return { next_actions: actions };
  } catch (error) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Unexpected error while generating next actions." };
  }
}

function extractNextActions(payload: OpenAIResponseBody): string[] {
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
    return normalizeActions(jsonChunk.json as Record<string, unknown>);
  }

  const textChunk = Array.isArray(content)
    ? content.find((chunk: OpenAIContentChunk) => Array.isArray(chunk?.text) && chunk.text.length > 0)
    : undefined;

  if (textChunk?.text?.[0]) {
    try {
      return normalizeActions(JSON.parse(textChunk.text[0]) as Record<string, unknown>);
    } catch {
      return [];
    }
  }

  if (primary?.content?.[0]?.json) {
    return normalizeActions(primary.content[0].json as Record<string, unknown>);
  }

  return [];
}

function normalizeActions(raw: Record<string, unknown>): string[] {
  const actions = Array.isArray((raw as { next_actions?: unknown }).next_actions)
    ? (raw as { next_actions: unknown[] }).next_actions
    : [];

  return actions
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}
