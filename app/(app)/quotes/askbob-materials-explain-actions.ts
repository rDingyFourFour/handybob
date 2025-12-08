"use server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import {
  AskBobMaterialsExplainInput,
  AskBobMaterialsExplainItemSummary,
  AskBobMaterialExplanation,
} from "@/lib/domain/askbob/types";
import { runAskBobMaterialsExplainTask } from "@/lib/domain/askbob/service";

type ExplainMaterialsQuotePayload = {
  materialsQuoteId: string;
  extraDetails?: string | null;
};

export type ExplainMaterialsQuoteWithAskBobResult =
  | {
      ok: true;
      materialsQuoteId: string;
      explanation: string;
      itemExplanations?: AskBobMaterialExplanation[] | null;
      notes?: string | null;
      modelLatencyMs: number;
    }
  | { ok: false; error: string };

export async function explainMaterialsQuoteWithAskBobAction(
  payload: ExplainMaterialsQuotePayload
): Promise<ExplainMaterialsQuoteWithAskBobResult> {
  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    return { ok: false, error: "Workspace or user context is unavailable." };
  }

  const trimmedId = payload.materialsQuoteId?.trim();
  if (!trimmedId) {
    return { ok: false, error: "Materials quote ID is required." };
  }

  const selectCols = `
    id,
    workspace_id,
    user_id,
    job_id,
    customer_id,
    status,
    subtotal,
    tax,
    total,
    line_items,
    client_message_template,
    public_token,
    created_at,
    updated_at,
    accepted_at,
    paid_at,
    smart_quote_used
  `;

  const { data: quote } = await supabase
    .from("quotes")
    .select(selectCols)
    .eq("workspace_id", workspace.id)
    .eq("id", trimmedId)
    .maybeSingle();

  if (!quote) {
    const { data: otherQuote } = await supabase
      .from("quotes")
      .select("id")
      .eq("id", trimmedId)
      .maybeSingle();
    const reason = otherQuote ? "wrong_workspace" : "not_found";
    console.error("[askbob-materials-explain-ui-failure] materials quote lookup returned no rows", {
      workspaceId: workspace.id,
      userId: user.id,
      materialsQuoteId: trimmedId,
      reason,
    });
    const message =
      reason === "wrong_workspace"
        ? "Materials quote exists but isn’t part of this workspace."
        : "Materials quote not found.";
    return { ok: false, error: message };
  }

  const lineItems = Array.isArray(quote.line_items) ? quote.line_items : [];
  const items = lineItems
    .map((entry) => mapMaterialsLineForExplain(entry as Record<string, unknown>))
    .filter((item): item is AskBobMaterialsExplainItemSummary => Boolean(item));

  const explainInput: AskBobMaterialsExplainInput = {
    task: "materials.explain",
    context: {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: quote.job_id ?? null,
      customerId: quote.customer_id ?? null,
      quoteId: quote.id,
    },
    materialsSummary: {
      id: quote.id,
      jobId: quote.job_id ?? null,
      customerId: quote.customer_id ?? null,
      subtotal: quote.subtotal,
      tax: quote.tax,
      total: quote.total,
      currency: null,
      items,
    },
    extraDetails: payload.extraDetails?.trim() || null,
  };

  console.log("[askbob-materials-explain-ui-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    materialsQuoteId: quote.id,
    itemsCount: items.length,
    hasExtraDetails: Boolean(payload.extraDetails?.trim()),
  });

  try {
    const result = await runAskBobMaterialsExplainTask(explainInput);
    console.log("[askbob-materials-explain-ui-success]", {
      workspaceId: workspace.id,
      userId: user.id,
      materialsQuoteId: quote.id,
      modelLatencyMs: result.modelLatencyMs,
      explanationLength: result.overallExplanation.length,
    });
    return {
      ok: true,
      materialsQuoteId: quote.id,
      explanation: result.overallExplanation,
      itemExplanations: result.itemExplanations ?? null,
      notes: result.notes ?? null,
      modelLatencyMs: result.modelLatencyMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-materials-explain-ui-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      materialsQuoteId: quote.id,
      errorMessage: truncatedError,
    });
    return { ok: false, error: "AskBob couldn’t explain this materials quote. Please try again." };
  }
}

function mapMaterialsLineForExplain(line: Record<string, unknown>): AskBobMaterialsExplainItemSummary | null {
  const name =
    normalizeString(
      line["description"] ?? line["name"] ?? line["item"] ?? line["label"] ?? line["scope"],
    ) ?? null;
  if (!name) {
    return null;
  }

  const quantity = normalizeNumber(line["quantity"] ?? line["qty"] ?? line["amount"]);
  const unit = normalizeString(line["unit"] ?? line["units"] ?? line["unitLabel"]);
  const estimatedUnitCost = normalizeNumber(
    line["estimatedUnitCost"] ??
      line["unit_price"] ??
      line["unitPrice"] ??
      line["cost"] ??
      line["price"],
  );
  const estimatedTotalCost = normalizeNumber(
    line["estimatedTotalCost"] ??
      line["total"] ??
      line["lineTotal"] ??
      line["amount"],
  );

  return {
    name,
    quantity,
    unit,
    estimatedUnitCost,
    estimatedTotalCost,
  };
}

function normalizeString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
