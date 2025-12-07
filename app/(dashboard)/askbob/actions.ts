"use server";

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/supabase/types";
import {
  AskBobContext,
  AskBobRequestInput,
  AskBobResponseDTO,
  AskBobResponseData,
  askBobRequestInputSchema,
} from "@/lib/domain/askbob/types";
import {
  createAskBobSessionWithContext,
  saveAskBobResponse,
  toAskBobResponseDTO,
} from "@/lib/domain/askbob/service";
import { callAskBobModel } from "@/utils/openai/askbob";
import { createServerClient } from "@/utils/supabase/server";

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
  const parsed = askBobRequestInputSchema.parse(rawInput);
  const { supabase, userId } = await getAuthedSupabaseClient();

  const context: AskBobContext = {
    workspaceId: parsed.workspaceId,
    userId,
    jobId: parsed.jobId ?? null,
    customerId: parsed.customerId ?? null,
    quoteId: parsed.quoteId ?? null,
  };

  const session = await createAskBobSessionWithContext(supabase, {
    context,
    prompt: parsed.prompt,
  });

  const modelData: AskBobResponseData = await callAskBobModel({
    prompt: parsed.prompt,
    context,
  });

  const response = await saveAskBobResponse(supabase, {
    sessionId: session.id,
    data: modelData,
  });

  const dto = toAskBobResponseDTO({
    sessionId: session.id,
    responseId: response.id,
    createdAt: response.createdAt,
    data: modelData,
  });

  return dto;
}
