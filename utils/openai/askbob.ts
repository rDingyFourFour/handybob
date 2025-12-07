"use server";

import OpenAI from "openai";
import type {
  AskBobContext,
  AskBobMaterialItem,
  AskBobResponseData,
} from "@/lib/domain/askbob/types";

const DEFAULT_MODEL = process.env.OPENAI_ASKBOB_MODEL ?? "gpt-4.1";

type CallAskBobModelOptions = {
  prompt: string;
  context: AskBobContext;
};

type CallAskBobModelResult = {
  data: AskBobResponseData;
  latencyMs: number;
  modelName: string;
};

type ModelPayload = Record<string, unknown>;

export async function callAskBobModel({
  prompt,
  context,
}: CallAskBobModelOptions): Promise<CallAskBobModelResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for AskBob.");
  }

  const contextParts = [
    `workspaceId=${context.workspaceId}`,
    `userId=${context.userId}`,
    context.jobId ? `jobId=${context.jobId}` : null,
    context.customerId ? `customerId=${context.customerId}` : null,
    context.quoteId ? `quoteId=${context.quoteId}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const instructions =
    "You are AskBob, a technician-focused assistant for HandyBob. Respond with a JSON object only (no surrounding prose) containing the keys: steps (array of strings describing the step-by-step solution), materials (array of { name, quantity?, notes? }), safetyCautions (array of short precautions), costTimeConsiderations (array of considerations about cost or time), and escalationGuidance (array of reasons to escalate). Keep the tone practical, concise, and meant for field technicians.";
  const userMessage = `Technician prompt:\n${prompt}\n\nContext: ${contextParts}`;

  const openai = new OpenAI({ apiKey });
  const modelRequestStart = Date.now();
  let modelName = DEFAULT_MODEL;

  try {
    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    });

    modelName = completion.model ?? DEFAULT_MODEL;
    const messageContent = completion.choices?.[0]?.message?.content;
    const payload = extractModelPayload(messageContent, {
      workspaceId: context.workspaceId,
      model: modelName,
    });

    const steps = ensureStringArray(payload.steps);
    const materials = normalizeMaterials(payload.materials);
    const safetyCautions = ensureStringArray(payload.safetyCautions);
    const costTimeConsiderations = ensureStringArray(payload.costTimeConsiderations);
    const escalationGuidance = ensureStringArray(payload.escalationGuidance);

    const latencyMs = Date.now() - modelRequestStart;
    console.log("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: prompt.length,
      latencyMs,
      success: true,
    });

    return {
      data: {
        steps,
        materials,
        safetyCautions: safetyCautions.length ? safetyCautions : undefined,
        costTimeConsiderations: costTimeConsiderations.length ? costTimeConsiderations : undefined,
        escalationGuidance: escalationGuidance.length ? escalationGuidance : undefined,
        rawModelOutput: payload,
      },
      latencyMs,
      modelName,
    };
  } catch (error) {
    const latencyMs = Date.now() - modelRequestStart;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError = errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;

    console.error("[askbob-model-call]", {
      model: modelName,
      workspaceId: context.workspaceId,
      userId: context.userId,
      promptLength: prompt.length,
      latencyMs,
      success: false,
      errorMessage: truncatedError,
    });

    throw error;
  }
}

function extractModelPayload(
  rawContent: unknown,
  meta: { workspaceId: string; model: string }
): ModelPayload {
  const candidates = Array.isArray(rawContent) ? rawContent : [rawContent];

  for (const candidate of candidates) {
    try {
      return parseJsonCandidate(candidate);
    } catch {
      continue;
    }
  }

  logJsonParseError(candidates[0], meta);
  throw new Error("AskBob model returned invalid JSON");
}

function parseJsonCandidate(candidate: unknown): ModelPayload {
  if (typeof candidate === "object" && candidate !== null) {
    return candidate as ModelPayload;
  }

  if (typeof candidate === "string") {
    const cleaned = cleanJsonString(candidate);
    return JSON.parse(cleaned);
  }

  throw new Error("AskBob model returned invalid JSON");
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

function logJsonParseError(candidate: unknown, meta: { workspaceId: string; model: string }) {
  console.warn("[askbob-json-parse-error]", {
    workspaceId: meta.workspaceId,
    model: meta.model,
    rawSnippet: getCandidateSnippet(candidate),
    candidateType: describeCandidateType(candidate),
  });
}

function getCandidateSnippet(candidate: unknown): string {
  if (candidate === undefined) {
    return "undefined";
  }
  if (candidate === null) {
    return "null";
  }
  if (typeof candidate === "string") {
    return cleanJsonString(candidate).slice(0, 200);
  }
  try {
    return JSON.stringify(candidate).replace(/\s+/g, " ").slice(0, 200);
  } catch {
    return String(candidate).slice(0, 200);
  }
}

function describeCandidateType(candidate: unknown): string {
  if (candidate === null) {
    return "null";
  }
  if (Array.isArray(candidate)) {
    return "array";
  }
  return typeof candidate;
}

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeMaterials(value: unknown): AskBobMaterialItem[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const normalized: AskBobMaterialItem[] = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidateName = (item as Record<string, unknown>).name;
      const name =
        typeof candidateName === "string" ? candidateName.trim() : candidateName === undefined ? "" : String(candidateName).trim();
      if (!name) return null;

      const quantityRaw = (item as Record<string, unknown>).quantity;
      const quantity =
        quantityRaw === null || quantityRaw === undefined
          ? null
          : typeof quantityRaw === "string"
          ? quantityRaw.trim() || null
          : String(quantityRaw).trim() || null;

      const notesRaw = (item as Record<string, unknown>).notes;
      const notes = typeof notesRaw === "string" ? notesRaw.trim() || null : null;

      return { name, quantity, notes };
    })
    .filter((material): material is AskBobMaterialItem => Boolean(material));

  return normalized.length ? normalized : undefined;
}
