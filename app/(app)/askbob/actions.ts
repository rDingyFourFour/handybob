"use server";

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/supabase/types";
import {
  AskBobContext,
  AskBobJobDiagnoseInput,
  AskBobRequestInput,
  AskBobResponseDTO,
  askBobRequestInputSchema,
} from "@/lib/domain/askbob/types";
import { runAskBobTask } from "@/lib/domain/askbob/service";
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

    const hasJobTitle = Boolean(parsedInput.jobTitle);
    console.log("[askbob-query]", {
      workspaceId: context.workspaceId,
      userId,
      hasJobId: Boolean(context.jobId),
      hasCustomerId: Boolean(context.customerId),
      hasQuoteId: Boolean(context.quoteId),
      hasJobTitle,
      promptLength: parsedInput.prompt.length,
    });

    const taskInput: AskBobJobDiagnoseInput = {
      task: "job.diagnose",
      context,
      prompt: parsedInput.prompt,
      jobTitle: parsedInput.jobTitle ?? null,
      extraDetails: parsedInput.extraDetails ?? null,
    };

    const taskResult = await runAskBobTask(supabaseClient, taskInput);

    const getSectionCount = (type: "steps" | "safety" | "costTime" | "escalation") =>
      taskResult.sections.find((section) => section.type === type)?.items.length ?? 0;
    const stepsCount = getSectionCount("steps");
    const safetyCautionsCount = getSectionCount("safety");
    const costTimeConsiderationsCount = getSectionCount("costTime");
    const escalationGuidanceCount = getSectionCount("escalation");
    const hasMaterials = (taskResult.materials?.length ?? 0) > 0;

    console.log("[askbob-success]", {
      workspaceId: context.workspaceId,
      userId,
      sessionId: taskResult.sessionId,
      responseId: taskResult.responseId,
      hasMaterials,
      stepsCount,
      safetyCautionsCount,
      costTimeConsiderationsCount,
      escalationGuidanceCount,
      modelLatencyMs: taskResult.modelLatencyMs,
    });

    return taskResult;
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
