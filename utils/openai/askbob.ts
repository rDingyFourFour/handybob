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

type ModelPayload = Record<string, unknown>;

export async function callAskBobModel({
  prompt,
  context,
}: CallAskBobModelOptions): Promise<AskBobResponseData> {
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
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
  });

  const messageContent = completion.choices?.[0]?.message?.content;
  const payload = extractModelPayload(messageContent);

  const steps = ensureStringArray(payload.steps);
  const materials = normalizeMaterials(payload.materials);
  const safetyCautions = ensureStringArray(payload.safetyCautions);
  const costTimeConsiderations = ensureStringArray(payload.costTimeConsiderations);
  const escalationGuidance = ensureStringArray(payload.escalationGuidance);

  return {
    steps,
    materials,
    safetyCautions: safetyCautions.length ? safetyCautions : undefined,
    costTimeConsiderations: costTimeConsiderations.length ? costTimeConsiderations : undefined,
    escalationGuidance: escalationGuidance.length ? escalationGuidance : undefined,
    rawModelOutput: payload,
  };
}

function extractModelPayload(rawContent: unknown): ModelPayload {
  const candidates = Array.isArray(rawContent) ? rawContent : [rawContent];

  for (const candidate of candidates) {
    try {
      return parseJsonCandidate(candidate);
    } catch {
      continue;
    }
  }

  console.warn(
    `[AskBob] Invalid JSON from model: ${describeCandidate(candidates[0])}`
  );
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

function describeCandidate(candidate: unknown): string {
  if (candidate === undefined) {
    return "undefined";
  }
  if (candidate === null) {
    return "null";
  }
  if (typeof candidate === "string") {
    return candidate.replace(/\s+/g, " ").slice(0, 400);
  }
  try {
    return JSON.stringify(candidate).slice(0, 400);
  } catch {
    return String(candidate);
  }
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
