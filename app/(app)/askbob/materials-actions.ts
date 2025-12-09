"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { runAskBobTask } from "@/lib/domain/askbob/service";
import type {
  AskBobMaterialsGenerateInput,
  AskBobMaterialsGenerateResult,
} from "@/lib/domain/askbob/types";
import {
  adaptAskBobMaterialsToSmartQuote,
  SmartQuoteSuggestion,
} from "@/lib/domain/quotes/materials-askbob-adapter";

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
  hasDiagnosisContextForMaterials: z.boolean().optional(),
});

export type MaterialsGeneratePayload = z.infer<typeof materialsGeneratePayloadSchema>;

export type MaterialsGenerateActionResult = {
  ok: true;
  jobId: string;
  suggestion: SmartQuoteSuggestion;
  modelLatencyMs: number;
};

export async function runAskBobMaterialsGenerateAction(
  payload: z.input<typeof materialsGeneratePayloadSchema>
): Promise<MaterialsGenerateActionResult> {
  const parsedPayload = materialsGeneratePayloadSchema.parse(payload);

  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    throw new Error("Workspace context is unavailable.");
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, customer_id")
    .eq("id", parsedPayload.jobId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!job) {
    throw new Error("Job not found.");
  }

  const { prompt: trimmedPrompt, extraDetails: trimmedExtraDetails } = parsedPayload;

  console.log("[askbob-materials-ui-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    promptLength: trimmedPrompt.length,
    hasExtraDetails: Boolean(trimmedExtraDetails),
    hasDiagnosisContextForMaterials: Boolean(parsedPayload.hasDiagnosisContextForMaterials),
    hasJobDescriptionContextForMaterials: Boolean(parsedPayload.hasJobDescriptionContextForMaterials),
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

    throw error;
  }
}
