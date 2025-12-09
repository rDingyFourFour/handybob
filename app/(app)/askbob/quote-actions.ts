"use server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { runAskBobTask } from "@/lib/domain/askbob/service";
import type {
  AskBobQuoteGenerateInput,
  AskBobQuoteGenerateResult,
  AskBobTaskContext,
} from "@/lib/domain/askbob/types";
import { adaptAskBobQuoteToSmartQuote, SmartQuoteSuggestion } from "@/lib/domain/quotes/askbob-adapter";

type QuoteGeneratePayload = {
  jobId: string;
  prompt: string;
  extraDetails?: string | null;
  hasDiagnosisContext?: boolean;
  hasMaterialsContext?: boolean;
  hasJobDescriptionContext?: boolean;
  hasMaterialsSummary?: boolean;
  hasDiagnosisSummary?: boolean;
  jobTitle?: string | null;
};

export type QuoteGenerateActionResult = {
  ok: true;
  jobId: string;
  suggestion: SmartQuoteSuggestion;
  modelLatencyMs: number;
};

export async function runAskBobQuoteGenerateAction(
  payload: QuoteGeneratePayload
): Promise<QuoteGenerateActionResult> {
  const trimmedJobId = payload.jobId?.trim() ?? "";
  const trimmedPrompt = payload.prompt?.trim() ?? "";
  const trimmedExtraDetails = payload.extraDetails?.trim() ?? "";
  const trimmedJobTitle = payload.jobTitle?.trim() ?? "";
  const normalizedJobTitle = trimmedJobTitle || null;

  if (!trimmedJobId) {
    throw new Error("Job ID is required to generate a quote.");
  }
  if (!trimmedPrompt) {
    throw new Error("A short prompt describing the quote is required.");
  }

  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    throw new Error("Workspace context is unavailable.");
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, customer_id")
    .eq("id", trimmedJobId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!job) {
    throw new Error("Job not found.");
  }

  const context: AskBobTaskContext = {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    customerId: job.customer_id ?? null,
    quoteId: null,
  };

  console.log("[askbob-quote-ui-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    promptLength: trimmedPrompt.length,
    hasExtraDetails: Boolean(trimmedExtraDetails),
    hasJobTitle: Boolean(normalizedJobTitle),
    hasDiagnosisContext: Boolean(payload.hasDiagnosisContext),
    hasMaterialsContext: Boolean(payload.hasMaterialsContext),
    hasJobDescriptionForQuote: Boolean(payload.hasJobDescriptionContext),
    hasMaterialsSummaryForQuote: Boolean(payload.hasMaterialsSummary),
    hasDiagnosisSummaryForQuote: Boolean(payload.hasDiagnosisSummary),
  });

  const taskInput: AskBobQuoteGenerateInput = {
    task: "quote.generate",
    context,
    prompt: trimmedPrompt,
    extraDetails: trimmedExtraDetails || null,
    jobTitle: normalizedJobTitle,
  };

  try {
    const taskResult = (await runAskBobTask(supabase, taskInput)) as AskBobQuoteGenerateResult;

    const suggestion = adaptAskBobQuoteToSmartQuote(taskResult);

    console.log("[askbob-quote-ui-success]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      modelLatencyMs: taskResult.modelLatencyMs,
      linesCount: suggestion.scopeLines.length,
      materialsCount: suggestion.materials?.length ?? 0,
      hasJobDescriptionForQuote: Boolean(payload.hasJobDescriptionContext),
      hasMaterialsSummaryForQuote: Boolean(payload.hasMaterialsSummary),
      hasDiagnosisSummaryForQuote: Boolean(payload.hasDiagnosisSummary),
      hasJobTitle: Boolean(normalizedJobTitle),
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
    console.error("[askbob-quote-ui-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      errorMessage: truncatedMessage,
    });
    throw error;
  }
}
