"use server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { runAskBobTask } from "@/lib/domain/askbob/service";
import type {
  AskBobMessageDraftInput,
  AskBobMessageDraftResult,
  AskBobTaskContext,
} from "@/lib/domain/askbob/types";

type DraftAskBobPayload = {
  workspaceId: string;
  jobId?: string | null;
  customerId?: string | null;
  quoteId?: string | null;
  purpose?: string;
  tone?: string | null;
  extraDetails?: string | null;
};

export type DraftAskBobResult = {
  customerId?: string | null;
  jobId?: string | null;
  body: string;
  meta: {
    suggestedChannel?: string | null;
    summary?: string | null;
    modelLatencyMs: number;
  };
};

async function buildMessageDraftContext(
  workspaceId: string,
  userId: string,
  customerId?: string | null,
  jobId?: string | null,
  quoteId?: string | null
): Promise<AskBobTaskContext> {
  return {
    workspaceId,
    userId,
    jobId: jobId ?? null,
    customerId: customerId ?? null,
    quoteId: quoteId ?? null,
  };
}

export async function draftAskBobCustomerMessageAction(
  payload: DraftAskBobPayload
): Promise<DraftAskBobResult> {
  const trimmedPurpose = payload.purpose?.trim() ?? "";
  const trimmedExtra = payload.extraDetails?.trim() ?? "";

  if (!payload.workspaceId) {
    throw new Error("Workspace ID is required for AskBob message drafts.");
  }

  const hasIntent = Boolean(trimmedPurpose) || Boolean(trimmedExtra);
  if (!hasIntent) {
    throw new Error("Please provide a short description for the message draft.");
  }

  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user || workspace.id !== payload.workspaceId) {
    throw new Error("Workspace context mismatch.");
  }

  const context = await buildMessageDraftContext(
    workspace.id,
    user.id,
    payload.customerId,
    payload.jobId,
    payload.quoteId
  );

  const taskInput: AskBobMessageDraftInput = {
    task: "message.draft",
    context,
    purpose: trimmedPurpose,
    tone: payload.tone ?? null,
    extraDetails: trimmedExtra || null,
  };

  console.log("[askbob-message-draft-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    hasJobId: Boolean(payload.jobId),
    hasCustomerId: Boolean(payload.customerId),
    purposeLength: trimmedPurpose.length,
    hasExtraDetails: Boolean(trimmedExtra),
  });

  try {
    const taskResult = (await runAskBobTask(supabase, taskInput)) as AskBobMessageDraftResult;

    console.log("[askbob-message-draft-success]", {
      workspaceId: workspace.id,
      userId: user.id,
      modelLatencyMs: taskResult.modelLatencyMs,
      bodyLength: taskResult.body.length,
      suggestedChannel: taskResult.suggestedChannel ?? null,
    });

    return {
      customerId: payload.customerId ?? null,
      jobId: payload.jobId ?? null,
      body: taskResult.body,
      meta: {
        suggestedChannel: taskResult.suggestedChannel ?? null,
        summary: taskResult.summary ?? null,
        modelLatencyMs: taskResult.modelLatencyMs,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : "Unknown error";
    console.error("[askbob-message-draft-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      hasJobId: Boolean(payload.jobId),
      hasCustomerId: Boolean(payload.customerId),
      purposeLength: trimmedPurpose.length,
      errorMessage: message.length <= 200 ? message : `${message.slice(0, 197)}...`,
    });
    throw error;
  }
}
