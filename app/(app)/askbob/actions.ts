"use server";

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/supabase/types";
import {
  AskBobContext,
  AskBobJobDiagnoseInput,
  AskBobRequestInput,
  AskBobResponseDTO,
  AskBobTaskContext,
  askBobRequestInputSchema,
} from "@/lib/domain/askbob/types";
import { runAskBobTask } from "@/lib/domain/askbob/service";
import { createServerClient } from "@/utils/supabase/server";
import { ZodError } from "zod";
import { resolveWorkspaceContext } from "@/lib/domain/workspaces";
import { getLatestJobTaskSnapshotVersion } from "@/lib/domain/askbob/repository";
import { formatSnapshotTimestamp } from "@/lib/domain/askbob/formatters";

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

type RegenerateDiagnosisActionResult = {
  ok: true;
  response: AskBobResponseDTO;
  versionId: string;
  createdAt: string;
  createdAtLabel: string | null;
} | {
  ok: false;
  code:
    | "unauthenticated"
    | "forbidden"
    | "workspace_not_found"
    | "invalid_input"
    | "job_not_found"
    | "missing_job_context"
    | "unknown";
  message: string;
};

const MIN_DIAGNOSE_PROMPT_LENGTH = 10;

const buildDiagnoseExtraDetails = ({
  jobTitle,
  jobDescription,
}: {
  jobTitle?: string | null;
  jobDescription?: string | null;
}): string | null => {
  const parts: string[] = [];
  if (jobTitle?.trim()) {
    parts.push(`Job title: ${jobTitle.trim()}`);
  }
  if (jobDescription?.trim()) {
    const snippet = jobDescription.trim().replace(/\s+/g, " ");
    parts.push(`Job description: ${snippet.length > 320 ? `${snippet.slice(0, 320)}...` : snippet}`);
  }
  return parts.length ? parts.join("\n\n") : null;
};

export async function regenerateDiagnosisAction(
  payload: { jobId: string }
): Promise<RegenerateDiagnosisActionResult> {
  const trimmedJobId = payload.jobId?.trim() ?? "";
  if (!trimmedJobId) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Job ID is required to regenerate diagnosis.",
    };
  }

  const supabase = await createServerClient();
  const workspaceResult = await resolveWorkspaceContext({
    supabase,
    allowAutoCreateWorkspace: false,
  });

  if (!workspaceResult.ok) {
    const code =
      workspaceResult.code === "unauthenticated"
        ? "unauthenticated"
        : workspaceResult.code === "workspace_not_found"
        ? "workspace_not_found"
        : workspaceResult.code === "no_membership"
        ? "forbidden"
        : "workspace_not_found";
    console.error("[askbob-diagnose-regenerate] workspace unavailable", {
      jobId: trimmedJobId,
      reason: code,
    });
    return {
      ok: false,
      code,
      message: "Workspace context is unavailable.",
    };
  }

  const { workspace, user } = workspaceResult.membership;
  const { data: job } = await supabase
    .from("jobs")
    .select("id, customer_id, title, description_raw")
    .eq("id", trimmedJobId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!job) {
    return { ok: false, code: "job_not_found", message: "Job not found." };
  }

  const jobTitle = job.title?.trim() ?? "";
  const jobDescription = job.description_raw?.trim() ?? "";
  const prompt = jobDescription || jobTitle;
  if (prompt.length < MIN_DIAGNOSE_PROMPT_LENGTH) {
    return {
      ok: false,
      code: "missing_job_context",
      message: "Add a job title or description before regenerating diagnosis.",
    };
  }

  const context: AskBobTaskContext = {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    customerId: job.customer_id ?? null,
    quoteId: null,
  };
  const extraDetails = buildDiagnoseExtraDetails({
    jobTitle: job.title ?? null,
    jobDescription: job.description_raw ?? null,
  });

  console.log("[askbob-diagnose-regenerate-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    hasJobTitle: Boolean(jobTitle),
    hasJobDescription: Boolean(jobDescription),
    promptLength: prompt.length,
  });

  const taskInput: AskBobJobDiagnoseInput = {
    task: "job.diagnose",
    context,
    prompt,
    jobTitle: jobTitle || null,
    extraDetails: extraDetails ?? null,
  };

  try {
    const taskResult = await runAskBobTask(supabase, taskInput);
    const latestVersion = await getLatestJobTaskSnapshotVersion(supabase, {
      workspaceId: workspace.id,
      jobId: job.id,
      task: "job.diagnose",
    });
    const createdAt = latestVersion?.created_at ?? new Date().toISOString();
    const versionId = latestVersion?.id ?? `${job.id}-${Date.now()}`;

    console.log("[askbob-diagnose-regenerate-success]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      responseId: taskResult.responseId,
      versionId,
    });

    return {
      ok: true,
      response: taskResult,
      versionId,
      createdAt,
      createdAtLabel: formatSnapshotTimestamp(createdAt),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const truncated = message.length <= 200 ? message : `${message.slice(0, 197)}...`;
    console.error("[askbob-diagnose-regenerate-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      errorMessage: truncated,
    });
    return {
      ok: false,
      code: "unknown",
      message: "AskBob couldn’t regenerate diagnosis. Please try again.",
    };
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
