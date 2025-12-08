import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/supabase/types";
import {
  AskBobContext,
  AskBobMessageDraftInput,
  AskBobMessageDraftResult,
  AskBobResponseData,
  AskBobResponseDTO,
  AskBobResponseDTOSection,
  AskBobTaskInput,
  AskBobTaskResult,
  askBobResponseDataSchema,
} from "./types";
import { createAskBobSession, createAskBobResponse } from "./repository";
import { callAskBobMessageDraft, callAskBobModel } from "@/utils/openai/askbob";

type DbClient = SupabaseClient<Database>;

const MIN_PROMPT_LENGTH = 10;

export async function createAskBobSessionWithContext(
  supabase: DbClient,
  params: {
    context: AskBobContext;
    prompt: string;
  }
) {
  const session = await createAskBobSession(supabase, {
    workspaceId: params.context.workspaceId,
    userId: params.context.userId,
    prompt: params.prompt,
    jobId: params.context.jobId ?? null,
    customerId: params.context.customerId ?? null,
    quoteId: params.context.quoteId ?? null,
  });

  return session;
}

export async function saveAskBobResponse(
  supabase: DbClient,
  params: {
    sessionId: string;
    data: AskBobResponseData;
  }
) {
  const parsedData = askBobResponseDataSchema.parse(params.data);

  const response = await createAskBobResponse(supabase, {
    sessionId: params.sessionId,
    data: parsedData,
  });

  return response;
}

// Primary entry point for AskBob tasks. It routes between supported tasks and will grow over time.
export async function runAskBobTask(
  supabase: DbClient,
  input: AskBobTaskInput
): Promise<AskBobTaskResult> {
  if (input.task === "message.draft") {
    return runAskBobMessageDraftTask(input);
  }
  const prompt = input.prompt?.trim();

  if (!prompt || prompt.length < MIN_PROMPT_LENGTH) {
    throw new Error("Please provide a bit more detail about the problem.");
  }

  try {
    const session = await createAskBobSessionWithContext(supabase, {
      context: input.context,
      prompt,
    });

    const modelResult = await callAskBobModel({
      prompt,
      context: input.context,
    });

    const response = await saveAskBobResponse(supabase, {
      sessionId: session.id,
      data: modelResult.data,
    });

    const dto = toAskBobResponseDTO({
      sessionId: session.id,
      responseId: response.id,
      createdAt: response.createdAt,
      data: modelResult.data,
    });

    return {
      ...dto,
      modelLatencyMs: modelResult.latencyMs,
    };
  } catch (error) {
    throw error;
  }
}

async function runAskBobMessageDraftTask(
  input: AskBobMessageDraftInput
): Promise<AskBobMessageDraftResult> {
  const purpose = input.purpose?.trim();
  if (!purpose) {
    throw new Error("Please provide a purpose for the message draft.");
  }

  const aggregatedPrompt = [
    purpose,
    input.extraDetails?.trim() ?? null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const modelResult = await callAskBobMessageDraft({
    prompt: aggregatedPrompt,
    context: input.context,
    purpose,
    tone: input.tone ?? null,
    extraDetails: input.extraDetails ?? null,
  });

  return {
    body: modelResult.body,
    suggestedChannel: modelResult.suggestedChannel,
    summary: modelResult.summary,
    modelLatencyMs: modelResult.latencyMs,
  };
}

export function toAskBobResponseDTO(input: {
  sessionId: string;
  responseId: string;
  createdAt: string;
  data: AskBobResponseData;
}): AskBobResponseDTO {
  const sections: AskBobResponseDTOSection[] = [];

  if (input.data.steps && input.data.steps.length > 0) {
    sections.push({
      type: "steps",
      title: "Step-by-step solution",
      items: input.data.steps,
    });
  }

  if (input.data.safetyCautions && input.data.safetyCautions.length > 0) {
    sections.push({
      type: "safety",
      title: "Safety cautions",
      items: input.data.safetyCautions,
    });
  }

  if (input.data.costTimeConsiderations && input.data.costTimeConsiderations.length > 0) {
    sections.push({
      type: "costTime",
      title: "Cost and time considerations",
      items: input.data.costTimeConsiderations,
    });
  }

  if (input.data.escalationGuidance && input.data.escalationGuidance.length > 0) {
    sections.push({
      type: "escalation",
      title: "When to escalate",
      items: input.data.escalationGuidance,
    });
  }

  return {
    sessionId: input.sessionId,
    responseId: input.responseId,
    createdAt: input.createdAt,
    sections,
    materials: input.data.materials,
  };
}
