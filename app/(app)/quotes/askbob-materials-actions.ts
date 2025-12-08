"use server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import {
  SmartQuoteSuggestion,
  estimateSmartQuoteTotals,
} from "@/lib/domain/quotes/askbob-adapter";

type ApplyAskBobMaterialsQuotePayload = {
  jobId: string;
  suggestion: SmartQuoteSuggestion;
};

export type ApplyAskBobMaterialsQuoteResult =
  | { ok: true; jobId: string; materialsQuoteId: string; quoteId: string }
  | { ok: false; error: string };

export async function applyAskBobMaterialsQuoteAction(
  payload: ApplyAskBobMaterialsQuotePayload,
): Promise<ApplyAskBobMaterialsQuoteResult> {
  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    console.error("[askbob-materials-applied-new-failure] workspace or user missing", {
      workspaceId: workspace?.id ?? null,
      userId: user?.id ?? null,
      jobId: payload.jobId,
    });
    return { ok: false, error: "Workspace or user context is unavailable." };
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id")
    .eq("id", payload.jobId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!job) {
    console.error("[askbob-materials-applied-new-failure] job not found", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: payload.jobId,
    });
    return { ok: false, error: "Job not found." };
  }

  const { subtotal, tax, total } = estimateSmartQuoteTotals(payload.suggestion);
  const normalizedSubtotal = subtotal ?? 0;
  const normalizedTax = tax ?? 0;
  const normalizedTotal = total ?? normalizedSubtotal + normalizedTax;
  const materialLineItems = (payload.suggestion.materials ?? []).map((material) => ({
    type: "material",
    description: material.name,
    quantity: material.quantity,
    unit: material.unit ?? null,
    unit_price: material.estimatedUnitCost ?? null,
    line_total: material.estimatedTotalCost ?? null,
  }));
  const lineItems = [...materialLineItems];

  try {
    const { data, error } = await supabase
      .from("quotes")
      .insert({
        workspace_id: workspace.id,
        user_id: user.id,
        job_id: job.id,
        subtotal: normalizedSubtotal,
        tax: normalizedTax,
        total: normalizedTotal,
        client_message_template: payload.suggestion.notes ?? null,
        line_items: lineItems,
        smart_quote_used: true,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      const message = error?.message ?? "Unable to create materials quote.";
      console.error("[askbob-materials-applied-new-failure]", {
        workspaceId: workspace.id,
        userId: user.id,
        jobId: job.id,
        errorMessage: message,
      });
      return { ok: false, error: message };
    }

    console.log("[askbob-materials-applied-new]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      materialsQuoteId: data.id,
      quoteId: data.id,
      itemsCount: materialLineItems.length,
    });

    return {
      ok: true,
      jobId: job.id,
      materialsQuoteId: data.id,
      quoteId: data.id,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create materials quote from AskBob suggestion.";
    const truncated = message.length <= 200 ? message : `${message.slice(0, 197)}...`;
    console.error("[askbob-materials-applied-new-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      errorMessage: truncated,
    });
    return { ok: false, error: "Unable to create materials quote from AskBob suggestion." };
  }
}
