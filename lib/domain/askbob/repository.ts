import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/supabase/types";
import {
  AskBobSession,
  AskBobResponse,
  AskBobResponseData,
} from "./types";

type DbClient = SupabaseClient<Database>;

export async function createAskBobSession(
  supabase: DbClient,
  params: {
    workspaceId: string;
    userId: string;
    prompt: string;
    jobId?: string | null;
    customerId?: string | null;
    quoteId?: string | null;
  }
): Promise<AskBobSession> {
  const { data, error } = await supabase
    .from("askbob_sessions")
    .insert({
      workspace_id: params.workspaceId,
      user_id: params.userId,
      prompt: params.prompt,
      job_id: params.jobId ?? null,
      customer_id: params.customerId ?? null,
      quote_id: params.quoteId ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create AskBob session: ${error?.message ?? "Unknown error"}`);
  }

  const session: AskBobSession = {
    id: data.id,
    workspaceId: data.workspace_id,
    userId: data.user_id,
    prompt: data.prompt,
    jobId: data.job_id,
    customerId: data.customer_id,
    quoteId: data.quote_id,
    createdAt: data.created_at,
  };

  return session;
}

export async function createAskBobResponse(
  supabase: DbClient,
  params: {
    sessionId: string;
    data: AskBobResponseData;
  }
): Promise<AskBobResponse> {
  const { data, error } = await supabase
    .from("askbob_responses")
    .insert({
      session_id: params.sessionId,
      steps: params.data.steps,
      materials: params.data.materials ?? null,
      safety_cautions: params.data.safetyCautions ?? null,
      cost_time_considerations: params.data.costTimeConsiderations ?? null,
      escalation_guidance: params.data.escalationGuidance ?? null,
      raw_model_output: params.data.rawModelOutput ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create AskBob response: ${error?.message ?? "Unknown error"}`);
  }

  const response: AskBobResponse = {
    id: data.id,
    sessionId: data.session_id,
    createdAt: data.created_at,
    steps: data.steps ?? [],
    materials: data.materials ?? undefined,
    safetyCautions: data.safety_cautions ?? undefined,
    costTimeConsiderations: data.cost_time_considerations ?? undefined,
    escalationGuidance: data.escalation_guidance ?? undefined,
    rawModelOutput: data.raw_model_output ?? undefined,
  };

  return response;
}
