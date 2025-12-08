"use server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { SmartQuoteSuggestion, estimateSmartQuoteTotals } from "@/lib/domain/quotes/askbob-adapter";

type CreateQuoteFromAskBobPayload = {
  jobId: string;
  suggestion: SmartQuoteSuggestion;
};

export type CreateQuoteFromAskBobResult =
  | { ok: true; quoteId: string }
  | { ok: false; error: string };

export async function createQuoteFromAskBobAction(
  payload: CreateQuoteFromAskBobPayload
): Promise<CreateQuoteFromAskBobResult> {
  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    return { ok: false, error: "Workspace or user context is unavailable." };
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("id", payload.jobId)
    .maybeSingle();

  if (!job) {
    console.error("[askbob-quote-applied-new-failure] job not found", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: payload.jobId,
    });
    return { ok: false, error: "Job not found." };
  }

  const { subtotal, tax, total } = estimateSmartQuoteTotals(payload.suggestion);
  const normalizedSubtotal = subtotal ?? 0;
  const normalizedTotal = total ?? normalizedSubtotal + tax;

  const scopeLineItems = payload.suggestion.scopeLines.map((line) => ({
    type: "scope",
    description: line.description,
    quantity: line.quantity,
    unit: line.unit ?? null,
    unit_price: line.unitPrice ?? null,
    line_total: line.lineTotal ?? null,
  }));

  const materialLineItems = payload.suggestion.materials?.map((material) => ({
    type: "material",
    description: material.name,
    quantity: material.quantity,
    unit: material.unit ?? null,
    unit_price: material.estimatedUnitCost ?? null,
    line_total: material.estimatedTotalCost ?? null,
  }));

  const lineItems = [
    ...scopeLineItems,
    ...(materialLineItems ?? []),
  ];

  try {
    const { data, error } = await supabase
      .from("quotes")
      .insert({
        workspace_id: workspace.id,
        user_id: user.id,
        job_id: job.id,
        subtotal: normalizedSubtotal,
        tax,
        total: normalizedTotal,
        client_message_template: payload.suggestion.notes ?? null,
        line_items: lineItems,
        smart_quote_used: true,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      const errMessage = error?.message ?? "Unable to create quote.";
      console.error("[askbob-quote-applied-new-failure]", {
        workspaceId: workspace.id,
        userId: user.id,
        jobId: job.id,
        errorMessage: errMessage,
      });
      return { ok: false, error: errMessage };
    }

    console.log("[askbob-quote-applied-new]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      quoteId: data.id,
      source: "askbob",
      scopeLinesCount: payload.suggestion.scopeLines.length,
      materialsCount: payload.suggestion.materials?.length ?? 0,
    });

    return { ok: true, quoteId: data.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const truncated = message.length <= 200 ? message : `${message.slice(0, 197)}...`;
    console.error("[askbob-quote-applied-new-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      errorMessage: truncated,
    });
    return { ok: false, error: "Unable to create quote from AskBob suggestion." };
  }
}
