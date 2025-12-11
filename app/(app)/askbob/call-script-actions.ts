"use server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { runAskBobTask } from "@/lib/domain/askbob/service";
import { AskBobJobCallScriptInput, AskBobJobCallScriptResult } from "@/lib/domain/askbob/types";
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
  callPurpose: z.enum(["intake", "scheduling", "followup"]),
  callTone: z.string().optional().nullable().transform(normalizeOptionalString),
  extraDetails: z.string().optional().nullable().transform(normalizeOptionalString),
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
    extraDetails: parsed.extraDetails,
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
    });
    return {
      ok: false,
      error: "AskBob could not generate a call script; please try again in a moment.",
    };
  }
}
