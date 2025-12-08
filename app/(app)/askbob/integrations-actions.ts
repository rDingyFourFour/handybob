"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { formatAskBobCustomerDraft, formatAskBobJobNote } from "@/lib/domain/askbob/formatters";
import { toAskBobResponseDTO } from "@/lib/domain/askbob/service";
import type { AskBobResponseDTO, AskBobResponseData } from "@/lib/domain/askbob/types";
import { logMessage } from "@/utils/communications/logMessage";

type AskBobIntegrationDbClient = SupabaseClient;

type AskBobResponseRow = {
  id: string;
  session_id: string;
  steps: string[] | null;
  materials: AskBobResponseData["materials"] | null;
  safety_cautions: string[] | null;
  cost_time_considerations: string[] | null;
  escalation_guidance: string[] | null;
  raw_model_output: AskBobResponseData["rawModelOutput"] | null;
  created_at: string;
  session: {
    workspace_id: string;
    job_id: string | null;
    customer_id: string | null;
    quote_id: string | null;
  } | null;
};

type CreateJobNotePayload = {
  workspaceId: string;
  askbobResponseId: string;
  jobId: string;
};

type CreateMessageDraftPayload = {
  workspaceId: string;
  askbobResponseId: string;
  customerId: string;
  jobId?: string | null;
};

type MessageDraftResult = {
  customerId: string;
  jobId?: string | null;
  body: string;
};

export async function createAskBobJobNoteAction({
  workspaceId,
  askbobResponseId,
  jobId,
}: CreateJobNotePayload) {
  if (!workspaceId || !askbobResponseId || !jobId) {
    throw new Error("Missing required AskBob job note payload.");
  }

  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user || workspace.id !== workspaceId) {
    throw new Error("Workspace context mismatch.");
  }

  const { dto, session } = await loadAskBobResponse(supabase, askbobResponseId, workspaceId);
  const noteBody = formatAskBobJobNote(dto, {
    jobId,
    quoteId: session.quoteId ?? undefined,
  });

  const logResult = await logMessage({
    supabase,
    workspaceId: workspace.id,
    userId: user.id,
    jobId,
    channel: "note",
    direction: "outbound",
    body: noteBody,
    status: "saved",
  });

  if (!logResult.ok) {
    const message = logResult.error ?? "Unknown error";
    console.error("[askbob-job-note-failure]", {
      workspaceId,
      userId: user.id,
      jobId,
      askbobResponseId,
      error: message,
    });
    throw new Error(`Failed to save job note: ${message}`);
  }

  console.log("[askbob-job-note-created]", {
    workspaceId,
    userId: user.id,
    jobId,
    askbobResponseId,
    noteLength: noteBody.length,
    messageId: logResult.messageId ?? null,
  });

  return { ok: true, noteId: logResult.messageId ?? null };
}

export async function createAskBobMessageDraftAction({
  workspaceId,
  askbobResponseId,
  customerId,
  jobId: jobIdOverride,
}: CreateMessageDraftPayload): Promise<MessageDraftResult> {
  if (!workspaceId || !askbobResponseId || !customerId) {
    throw new Error("Missing required AskBob message draft payload.");
  }

  const supabase = await createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  if (!workspace || workspace.id !== workspaceId) {
    throw new Error("Workspace context mismatch.");
  }

  const { dto, session } = await loadAskBobResponse(supabase, askbobResponseId, workspaceId);
  const draftBody = formatAskBobCustomerDraft(dto, {
    jobId: jobIdOverride ?? session.jobId ?? undefined,
    quoteId: session.quoteId ?? undefined,
  });

  console.log("[askbob-message-draft-created]", {
    workspaceId,
    customerId,
    jobId: jobIdOverride ?? session.jobId ?? null,
    askbobResponseId,
    bodyLength: draftBody.length,
  });

  return {
    customerId,
    jobId: jobIdOverride ?? session.jobId ?? null,
    body: draftBody,
  };
}

async function loadAskBobResponse(
  supabase: AskBobIntegrationDbClient,
  responseId: string,
  workspaceId: string
): Promise<{ dto: AskBobResponseDTO; session: { jobId?: string | null; customerId?: string | null; quoteId?: string | null } }> {
  const { data, error } = await supabase
    .from("askbob_responses")
    .select(
      `
      id,
      session_id,
      steps,
      materials,
      safety_cautions,
      cost_time_considerations,
      escalation_guidance,
      raw_model_output,
      created_at,
      session:askbob_sessions(workspace_id, job_id, customer_id, quote_id)
    `
    )
    .eq("id", responseId)
    .maybeSingle<AskBobResponseRow>();

  if (error || !data || !data.session) {
    throw new Error("AskBob response not found.");
  }

  if (data.session.workspace_id !== workspaceId) {
    throw new Error("AskBob response does not belong to this workspace.");
  }

  const responseData: AskBobResponseData = {
    steps: data.steps ?? [],
    materials: data.materials ?? undefined,
    safetyCautions: data.safety_cautions ?? undefined,
    costTimeConsiderations: data.cost_time_considerations ?? undefined,
    escalationGuidance: data.escalation_guidance ?? undefined,
    rawModelOutput: data.raw_model_output ?? undefined,
  };

  const dto = toAskBobResponseDTO({
    sessionId: data.session_id,
    responseId: data.id,
    createdAt: data.created_at,
    data: responseData,
  });

  return {
    dto,
    session: {
      jobId: data.session.job_id,
      customerId: data.session.customer_id,
      quoteId: data.session.quote_id,
    },
  };
}
