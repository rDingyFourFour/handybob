import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/supabase/types";
import {
  AskBobContext,
  AskBobResponseData,
  AskBobResponseDTO,
  AskBobResponseDTOSection,
  askBobResponseDataSchema,
} from "./types";
import { createAskBobSession, createAskBobResponse } from "./repository";

type DbClient = SupabaseClient<Database>;

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
