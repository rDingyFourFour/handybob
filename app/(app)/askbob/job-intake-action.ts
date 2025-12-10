"use server";

import OpenAI from "openai";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";

const DEFAULT_MODEL = process.env.OPENAI_ASKBOB_MODEL ?? "gpt-4.1";

const JOB_INTAKE_INSTRUCTIONS = [
  "You are AskBob, the technician assistant for HandyBob. Craft a concise summary of the job intake details so a field crew can quickly understand the scope.",
  "Output a single JSON object and nothing else. The object must contain two keys: suggested_title and suggested_description.",
  "suggested_title should be short (3-8 words), describe the main task, and avoid any bullet points or extra explanation.",
  "suggested_description should be 2-3 sentences capturing the work scope, location, and constraints or risks. Mention any safety concerns or follow-up triggers if they are obvious from the prompt.",
  "Do not wrap the JSON in markdown, and do not include additional keys.",
].join(" ");

type GenerateAskBobJobIntakeInput = {
  workspaceId: string;
  prompt: string;
};

type GenerateAskBobJobIntakeResult = {
  suggestedTitle?: string | null;
  suggestedDescription?: string | null;
};

export async function generateAskBobJobIntakeAction({
  workspaceId,
  prompt,
}: GenerateAskBobJobIntakeInput): Promise<GenerateAskBobJobIntakeResult> {
  const trimmedPrompt = prompt?.trim();
  if (!trimmedPrompt) {
    throw new Error("Please describe the job before generating a suggestion.");
  }

  if (!workspaceId) {
    throw new Error("Workspace context is required to run AskBob.");
  }

  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("You must be signed in to use AskBob.");
  }

  const { workspace } = await getCurrentWorkspace({ supabase });
  if (!workspace || workspace.id !== workspaceId) {
    throw new Error("Workspace could not be resolved for AskBob.");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("AskBob is not configured. OPENAI_API_KEY is missing.");
  }

  const openai = new OpenAI({ apiKey });
  const contextParts = [
    `Workspace: ${workspace.id}`,
    `User: ${user.id}`,
  ].join("\n");

  const userMessage = [`${trimmedPrompt}`, contextParts].filter(Boolean).join("\n\n");

  const completionStart = Date.now();
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: JOB_INTAKE_INSTRUCTIONS },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
  });

  const model = completion.model ?? DEFAULT_MODEL;
  const latencyMs = Date.now() - completionStart;
  console.log("[askbob-job-intake]", {
    workspaceId: workspace.id,
    userId: user.id,
    promptLength: trimmedPrompt.length,
    model,
    latencyMs,
  });

  const rawContent = completion.choices?.[0]?.message?.content;
  const payload = parseJsonCandidate(rawContent);

  return {
    suggestedTitle: toNullableTrimmedString(payload.suggested_title),
    suggestedDescription: toNullableTrimmedString(payload.suggested_description),
  };
}

function parseJsonCandidate(candidate: unknown): Record<string, unknown> {
  if (typeof candidate === "object" && candidate !== null) {
    return candidate as Record<string, unknown>;
  }

  if (typeof candidate === "string") {
    const cleaned = cleanJsonString(candidate);
    try {
      return JSON.parse(cleaned);
    } catch (error) {
      console.error("[askbob-job-intake-json]", { candidate: cleaned, error });
      throw new Error("AskBob response could not be parsed.");
    }
  }

  throw new Error("AskBob returned an unexpected response format.");
}

function cleanJsonString(value: string): string {
  let trimmed = value.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    trimmed = fenceMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    trimmed = trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function toNullableTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}
