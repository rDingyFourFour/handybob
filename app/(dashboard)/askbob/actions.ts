"use server";

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/supabase/types";
import {
  AskBobContext,
  AskBobRequestInput,
  AskBobResponseDTO,
  askBobRequestInputSchema,
} from "@/lib/domain/askbob/types";
import {
  createAskBobSessionWithContext,
  saveAskBobResponse,
  toAskBobResponseDTO,
} from "@/lib/domain/askbob/service";
import { callAskBobModel } from "@/utils/openai/askbob";
import { createServerClient } from "@/utils/supabase/server";
import { ZodError } from "zod";

type DbClient = SupabaseClient<Database>;

async function getAuthedSupabaseClient(): Promise<{ supabase: DbClient; userId: string }> {
  const supabase = (await createServerClient()) as DbClient;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Not authenticated.");
  }

  return { supabase, userId: user.id };
}

export async function submitAskBobQueryAction(
  rawInput: AskBobRequestInput
): Promise<AskBobResponseDTO> {
  let parsedInput: AskBobRequestInput | null = null;
  let context: AskBobContext | null = null;
  let userId: string | null = null;
  let supabaseClient: DbClient | null = null;

  try {
    parsedInput = askBobRequestInputSchema.parse(rawInput);
    const authResult = await getAuthedSupabaseClient();
    supabaseClient = authResult.supabase;
    userId = authResult.userId;

    context = {
      workspaceId: parsedInput.workspaceId,
      userId,
      jobId: parsedInput.jobId ?? null,
      customerId: parsedInput.customerId ?? null,
      quoteId: parsedInput.quoteId ?? null,
    };

    console.log("[askbob-query]", {
      workspaceId: context.workspaceId,
      userId,
      hasJobId: Boolean(context.jobId),
      hasCustomerId: Boolean(context.customerId),
      hasQuoteId: Boolean(context.quoteId),
      promptLength: parsedInput.prompt.length,
    });

    const session = await createAskBobSessionWithContext(supabaseClient, {
      context,
      prompt: parsedInput.prompt,
    });

    const modelResult = await callAskBobModel({
      prompt: parsedInput.prompt,
      context,
    });

    const response = await saveAskBobResponse(supabaseClient, {
      sessionId: session.id,
      data: modelResult.data,
    });

    const dto = toAskBobResponseDTO({
      sessionId: session.id,
      responseId: response.id,
      createdAt: response.createdAt,
      data: modelResult.data,
    });

    const stepsCount = modelResult.data.steps.length;
    const safetyCautionsCount = modelResult.data.safetyCautions?.length ?? 0;
    const costTimeConsiderationsCount = modelResult.data.costTimeConsiderations?.length ?? 0;
    const escalationGuidanceCount = modelResult.data.escalationGuidance?.length ?? 0;
    const hasMaterials = (modelResult.data.materials?.length ?? 0) > 0;

    console.log("[askbob-success]", {
      workspaceId: context.workspaceId,
      userId,
      sessionId: session.id,
      responseId: response.id,
      hasMaterials,
      stepsCount,
      safetyCautionsCount,
      costTimeConsiderationsCount,
      escalationGuidanceCount,
      modelLatencyMs: modelResult.latencyMs,
    });

    return dto;
  } catch (error) {
    logAskBobFailure({
      error,
      context,
      parsedInput,
    });

    throw error;
  }
}

type LogFailureArgs = {
  error: unknown;
  context: AskBobContext | null;
  parsedInput: AskBobRequestInput | null;
};

function logAskBobFailure({ error, context, parsedInput }: LogFailureArgs) {
  const workspaceId = parsedInput?.workspaceId ?? null;
  const hasJobId = Boolean(parsedInput?.jobId);
  const hasCustomerId = Boolean(parsedInput?.customerId);
  const hasQuoteId = Boolean(parsedInput?.quoteId);
  const promptLength = parsedInput?.prompt.length ?? null;

  const truncatedMessage = getTruncatedErrorMessage(error);
  const errorType = categorizeAskBobError(error);

  console.error("[askbob-failure]", {
    workspaceId,
    userId: context?.userId ?? null,
    hasJobId,
    hasCustomerId,
    hasQuoteId,
    promptLength,
    errorType,
    errorMessage: truncatedMessage,
  });
}

function getTruncatedErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.length <= 200) {
    return message;
  }
  return `${message.slice(0, 197)}...`;
}

function categorizeAskBobError(error: unknown) {
  if (error instanceof ZodError) {
    return "validation";
  }

  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();
    if (normalized.includes("not authenticated") || normalized.includes("auth")) {
      return "auth";
    }
    if (normalized.includes("openai") || normalized.includes("model")) {
      return "openai";
    }
    if (normalized.includes("supabase") || normalized.includes("database") || normalized.includes("insert")) {
      return "db";
    }
  }

  return "unknown";
}
