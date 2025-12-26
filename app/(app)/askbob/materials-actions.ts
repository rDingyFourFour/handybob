"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { resolveWorkspaceContext } from "@/lib/domain/workspaces";
import { runAskBobTask } from "@/lib/domain/askbob/service";
import type {
  AskBobMaterialsGenerateInput,
  AskBobMaterialsGenerateResult,
} from "@/lib/domain/askbob/types";
import {
  adaptAskBobMaterialsToSmartQuote,
  SmartQuoteSuggestion,
} from "@/lib/domain/quotes/materials-askbob-adapter";

const normalizeOptionalString = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const materialsGeneratePayloadSchema = z.object({
  jobId: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, {
      message: "Job ID is required to generate materials.",
    }),
  prompt: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, {
      message: "A short prompt describing the materials is required.",
    }),
  extraDetails: z
    .string()
    .optional()
    .nullable()
    .transform((value) => {
      if (!value) {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
  }),
  jobTitle: z
    .string()
    .optional()
    .nullable()
    .transform((value) => {
      if (!value) {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }),
  hasDiagnosisContextForMaterials: z.boolean().optional(),
  hasJobDescriptionContextForMaterials: z.boolean().optional(),
  diagnosisSummary: z
    .string()
    .optional()
    .nullable()
    .transform(normalizeOptionalString),
});

export type MaterialsGeneratePayload = z.infer<typeof materialsGeneratePayloadSchema>;

export type MaterialsGenerateActionResult = {
  ok: true;
  jobId: string;
  suggestion: SmartQuoteSuggestion;
  modelLatencyMs: number;
} | {
  ok: false;
  code:
    | "unauthenticated"
    | "forbidden"
    | "workspace_not_found"
    | "invalid_input"
    | "job_not_found"
    | "unknown";
  message: string;
};

export async function runAskBobMaterialsGenerateAction(
  payload: z.input<typeof materialsGeneratePayloadSchema>
): Promise<MaterialsGenerateActionResult> {
  const parsedPayload = materialsGeneratePayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    console.error("[askbob-materials-ui-failure] invalid payload", {
      issues: parsedPayload.error.issues.map((issue) => issue.message),
    });
    return {
      ok: false,
      code: "invalid_input",
      message: "We couldn’t generate materials with the provided details.",
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
    console.error("[askbob-materials-ui-failure] workspace unavailable", {
      jobId: payload.jobId ?? null,
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
    .select("id, customer_id")
    .eq("id", parsedPayload.data.jobId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!job) {
    return { ok: false, code: "job_not_found", message: "Job not found." };
  }

  const { prompt: trimmedPrompt, extraDetails: trimmedExtraDetails, jobTitle } = parsedPayload.data;
  const normalizedJobTitle = jobTitle ?? null;
  const hasDiagnosisContextForMaterials = Boolean(parsedPayload.data.diagnosisSummary);
  const hasJobDescriptionContextForMaterials = Boolean(
    parsedPayload.data.hasJobDescriptionContextForMaterials
  );

  console.log("[askbob-materials-ui-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    promptLength: trimmedPrompt.length,
    hasExtraDetails: Boolean(trimmedExtraDetails),
    hasJobTitle: Boolean(normalizedJobTitle),
    hasDiagnosisContextForMaterials,
    hasJobDescriptionContextForMaterials,
  });

  const taskInput: AskBobMaterialsGenerateInput = {
    task: "materials.generate",
    context: {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      customerId: job.customer_id ?? undefined,
      quoteId: undefined,
    },
    prompt: trimmedPrompt,
    extraDetails: trimmedExtraDetails ?? null,
    jobTitle: normalizedJobTitle,
  };

  try {
    const taskResult = (await runAskBobTask(
      supabase,
      taskInput
    )) as AskBobMaterialsGenerateResult;

    const suggestion = adaptAskBobMaterialsToSmartQuote(taskResult);
    const itemsCount = suggestion.materials?.length ?? 0;

    console.log("[askbob-materials-ui-success]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      modelLatencyMs: taskResult.modelLatencyMs,
      itemsCount,
    });

    return {
      ok: true,
      jobId: job.id,
      suggestion,
      modelLatencyMs: taskResult.modelLatencyMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedMessage =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;

    console.error("[askbob-materials-ui-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      error: truncatedMessage,
    });

    return {
      ok: false,
      code: "unknown",
      message: "AskBob couldn’t generate materials. Please try again.",
    };
  }
}
