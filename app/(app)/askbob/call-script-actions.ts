"use server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { runAskBobTask } from "@/lib/domain/askbob/service";
import {
  ASKBOB_CALL_INTENTS,
  ASKBOB_CALL_PERSONA_STYLES,
  AskBobJobCallScriptInput,
  AskBobJobCallScriptResult,
} from "@/lib/domain/askbob/types";
import { buildCallOutcomePromptContext } from "@/lib/domain/calls/latestCallOutcome";
import { z } from "zod";

const normalizeOptionalString = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const callScriptPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  customerId: z.string().min(1).optional().nullable(),
  jobTitle: z.string().optional().nullable().transform(normalizeOptionalString),
  jobDescription: z.string().optional().nullable().transform(normalizeOptionalString),
  diagnosisSummary: z.string().optional().nullable().transform(normalizeOptionalString),
  materialsSummary: z.string().optional().nullable().transform(normalizeOptionalString),
  lastQuoteSummary: z.string().optional().nullable().transform(normalizeOptionalString),
  followupSummary: z.string().optional().nullable().transform(normalizeOptionalString),
  latestCallOutcome: z
    .object({
      callId: z.string().min(1),
      occurredAt: z.string().optional().nullable(),
      reachedCustomer: z.boolean().nullable(),
      outcomeCode: z.string().nullable(),
      outcomeNotes: z.string().nullable(),
      isAskBobAssisted: z.boolean(),
      displayLabel: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  callPurpose: z.enum(["intake", "scheduling", "followup"]),
  callTone: z.string().optional().nullable().transform(normalizeOptionalString),
  extraDetails: z.string().optional().nullable().transform(normalizeOptionalString),
  callIntents: z
    .array(z.enum(ASKBOB_CALL_INTENTS))
    .optional()
    .transform((value) => {
      if (!value || !value.length) {
        return undefined;
      }
      return Array.from(new Set(value));
    }),
  callPersonaStyle: z.enum(ASKBOB_CALL_PERSONA_STYLES).optional().nullable(),
});

type CallScriptRequestPayload = z.infer<typeof callScriptPayloadSchema>;

type CallScriptSuccessResult = {
  ok: true;
  scriptBody: string;
  openingLine: string;
  closingLine: string;
  keyPoints: string[];
  suggestedDurationMinutes?: number | null;
  modelLatencyMs: number;
};

type CallScriptFailureResult = {
  ok: false;
  error: string;
};

export type AskBobCallScriptActionResult =
  | CallScriptSuccessResult
  | CallScriptFailureResult;

export async function runAskBobCallScriptAction(
  payload: CallScriptRequestPayload,
): Promise<AskBobCallScriptActionResult> {
  const parsed = callScriptPayloadSchema.parse(payload);
  const hasPersonaStyle = Boolean(parsed.callPersonaStyle);
  const personaStyle = parsed.callPersonaStyle ?? null;

  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    return { ok: false, error: "Workspace context unavailable." };
  }

  if (workspace.id !== parsed.workspaceId) {
    console.error("[askbob-call-script-ui-failure] workspace mismatch", {
      expectedWorkspaceId: workspace.id,
      payloadWorkspaceId: parsed.workspaceId,
      userId: user.id,
      jobId: parsed.jobId,
    });
    return { ok: false, error: "Workspace mismatch." };
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, workspace_id, customer_id, title, description_raw")
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.jobId)
    .maybeSingle();

  if (!job) {
    console.error("[askbob-call-script-ui-failure] job not found", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: parsed.jobId,
    });
    return { ok: false, error: "Job not found." };
  }

  const hasJobTitle = Boolean(parsed.jobTitle ?? job.title?.trim());
  const hasDiagnosisSummary = Boolean(parsed.diagnosisSummary);
  const hasMaterialsSummary = Boolean(parsed.materialsSummary);
  const hasLastQuoteSummary = Boolean(parsed.lastQuoteSummary);
  const hasFollowupSummary = Boolean(parsed.followupSummary);
  const latestCallOutcomeContext =
    parsed.latestCallOutcome && buildCallOutcomePromptContext(parsed.latestCallOutcome);
  const extraDetailsParts: string[] = [];
  if (parsed.extraDetails) {
    extraDetailsParts.push(parsed.extraDetails);
  }
  if (latestCallOutcomeContext) {
    extraDetailsParts.push(latestCallOutcomeContext);
  }
  const combinedExtraDetails = extraDetailsParts.length
    ? extraDetailsParts.join("\n\n")
    : null;

  console.log("[askbob-call-script-ui-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    hasJobTitle,
    hasDiagnosisSummary,
    hasMaterialsSummary,
    hasLastQuoteSummary,
    hasFollowupSummary,
    callPurpose: parsed.callPurpose,
    callTone: parsed.callTone ?? null,
    hasPersonaStyle,
    personaStyle,
    hasCallIntents: Boolean(parsed.callIntents?.length),
    callIntentsCount: parsed.callIntents?.length ?? 0,
    callIntents: parsed.callIntents ?? [],
  });

  const taskInput: AskBobJobCallScriptInput = {
    task: "job.call_script",
    context: {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      customerId: job.customer_id ?? parsed.customerId ?? null,
    },
    customerId: parsed.customerId ?? job.customer_id ?? null,
    jobTitle: parsed.jobTitle ?? job.title?.trim() ?? null,
    jobDescription: parsed.jobDescription ?? job.description_raw?.trim() ?? null,
    diagnosisSummary: parsed.diagnosisSummary,
    materialsSummary: parsed.materialsSummary,
    lastQuoteSummary: parsed.lastQuoteSummary,
    followupSummary: parsed.followupSummary,
    callPurpose: parsed.callPurpose,
    callTone: parsed.callTone,
    callPersonaStyle: parsed.callPersonaStyle ?? null,
    extraDetails: combinedExtraDetails,
    callIntents: parsed.callIntents ?? null,
    latestCallOutcome: parsed.latestCallOutcome ?? null,
    latestCallOutcomeContext: latestCallOutcomeContext ?? null,
  };

  try {
    const taskResult = (await runAskBobTask(supabase, taskInput)) as AskBobJobCallScriptResult;
    console.log("[askbob-call-script-ui-success]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      modelLatencyMs: taskResult.modelLatencyMs,
      scriptLength: taskResult.scriptBody.length,
      keyPointsCount: taskResult.keyPoints.length,
      callPurpose: parsed.callPurpose,
      hasPersonaStyle,
      personaStyle,
      hasCallIntents: Boolean(parsed.callIntents?.length),
      callIntentsCount: parsed.callIntents?.length ?? 0,
      callIntents: parsed.callIntents ?? [],
    });

    return {
      ok: true,
      scriptBody: taskResult.scriptBody,
      openingLine: taskResult.openingLine,
      closingLine: taskResult.closingLine,
      keyPoints: taskResult.keyPoints,
      suggestedDurationMinutes: taskResult.suggestedDurationMinutes ?? null,
      modelLatencyMs: taskResult.modelLatencyMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-call-script-ui-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      errorMessage: truncatedError,
      callPurpose: parsed.callPurpose,
      hasPersonaStyle,
      personaStyle,
      hasCallIntents: Boolean(parsed.callIntents?.length),
      callIntentsCount: parsed.callIntents?.length ?? 0,
      callIntents: parsed.callIntents ?? [],
    });
    return {
      ok: false,
      error: "AskBob could not generate a call script; please try again in a moment.",
    };
  }
}
