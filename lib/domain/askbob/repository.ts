import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/supabase/types";
import {
  AskBobSession,
  AskBobResponse,
  AskBobResponseData,
  AskBobTask,
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

type AskBobJobActivityRow = {
  created_at: string;
};

export interface AskBobJobActivitySummary {
  task: AskBobTask;
  createdAt: string;
  totalRunsCount: number;
  tasksSeen: AskBobTask[];
}

export async function getLastAskBobActivityForJob(
  supabase: DbClient,
  params: { workspaceId: string; jobId: string }
): Promise<AskBobJobActivitySummary | null> {
  const { data: latest, error: latestError } = await supabase
    .from<AskBobJobActivityRow>("askbob_sessions")
    .select("created_at")
    .eq("workspace_id", params.workspaceId)
    .eq("job_id", params.jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: countError, count } = await supabase
    .from("askbob_sessions")
    .select("id", { count: "exact" })
    .eq("workspace_id", params.workspaceId)
    .eq("job_id", params.jobId)
    .maybeSingle<{ id: string }>();

  const totalRunsCount = count ?? 0;

  if (latestError && !latest) {
    console.error("[askbob-repository] Failed to load last activity", {
      workspaceId: params.workspaceId,
      jobId: params.jobId,
      errorMessage: latestError.message,
    });
    return null;
  }

  if (countError) {
    console.error("[askbob-repository] Failed to count AskBob sessions", {
      workspaceId: params.workspaceId,
      jobId: params.jobId,
      errorMessage: countError.message,
    });
  }

  const createdAt = latest?.created_at ?? null;
  if (!createdAt) {
    return null;
  }

  return {
    task: "job.diagnose",
    createdAt,
    totalRunsCount,
    tasksSeen: totalRunsCount > 0 ? ["job.diagnose"] : [],
  };
}
