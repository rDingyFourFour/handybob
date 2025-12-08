"use server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import {
  AskBobLineExplanation,
  AskBobQuoteExplainInput,
  AskBobQuoteExplainLineSummary,
} from "@/lib/domain/askbob/types";
import { runAskBobQuoteExplainTask } from "@/lib/domain/askbob/service";

type ExplainQuotePayload = {
  quoteId: string;
  extraDetails?: string | null;
};

export type ExplainQuoteWithAskBobResult =
  | {
      ok: true;
      quoteId: string;
      explanation: string;
      lineExplanations?: AskBobLineExplanation[] | null;
      notes?: string | null;
      modelLatencyMs: number;
    }
  | { ok: false; error: string };

export async function explainQuoteWithAskBobAction(
  payload: ExplainQuotePayload
): Promise<ExplainQuoteWithAskBobResult> {
  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    return { ok: false, error: "Workspace or user context is unavailable." };
  }

  const trimmedQuoteId = payload.quoteId?.trim();
  if (!trimmedQuoteId) {
    return { ok: false, error: "Quote ID is required." };
  }

  const selectCols = `
    id,
    workspace_id,
    user_id,
    job_id,
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
    .eq("id", trimmedQuoteId)
    .maybeSingle();

  if (!quote) {
    const { data: otherQuote } = await supabase
      .from("quotes")
      .select("id")
      .eq("id", trimmedQuoteId)
      .maybeSingle();
    const reason = otherQuote ? "wrong_workspace" : "not_found";
    console.error("[askbob-quote-explain-ui-failure] quote lookup returned no rows", {
      workspaceId: workspace.id,
      userId: user.id,
      quoteId: trimmedQuoteId,
      reason,
    });
    const message =
      reason === "wrong_workspace"
        ? "Quote exists but isn’t part of this workspace."
        : "Quote not found.";
    return { ok: false, error: message };
  }

  const lineItems = Array.isArray(quote.line_items) ? quote.line_items : [];
  const lines = lineItems
    .map((item) => mapQuoteLineForExplain(item))
    .filter((line): line is AskBobQuoteExplainLineSummary => Boolean(line));

  const explainInput: AskBobQuoteExplainInput = {
    task: "quote.explain",
    context: {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: quote.job_id ?? null,
      customerId: quote.customer_id ?? null,
      quoteId: quote.id,
    },
    quoteSummary: {
      id: quote.id,
      jobId: quote.job_id ?? null,
      customerId: quote.customer_id ?? null,
      subtotal: quote.subtotal,
      tax: quote.tax,
      total: quote.total,
      currency: null,
      lines,
    },
    extraDetails: payload.extraDetails?.trim() || null,
  };

  console.log("[askbob-quote-explain-ui-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    quoteId: quote.id,
    lineCount: lines.length,
    hasMaterials: false,
    hasExtraDetails: Boolean(payload.extraDetails?.trim()),
  });

  try {
    const result = await runAskBobQuoteExplainTask(explainInput);
    console.log("[askbob-quote-explain-ui-success]", {
      workspaceId: workspace.id,
      userId: user.id,
      quoteId: quote.id,
      modelLatencyMs: result.modelLatencyMs,
      explanationLength: result.overallExplanation.length,
    });
    return {
      ok: true,
      quoteId: quote.id,
      explanation: result.overallExplanation,
      lineExplanations: result.lineExplanations ?? null,
      notes: result.notes ?? null,
      modelLatencyMs: result.modelLatencyMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-quote-explain-ui-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      quoteId: quote.id,
      errorMessage: truncatedError,
    });
    return { ok: false, error: "AskBob couldn’t explain this quote. Please try again." };
  }
}

function mapQuoteLineForExplain(line: Record<string, unknown>): AskBobQuoteExplainLineSummary | null {
  const description =
    normalizeString(line["description"] ?? line["label"] ?? line["scope"]);
  if (!description) {
    return null;
  }

  const quantity = normalizeNumber(line["quantity"] ?? line["qty"] ?? line["amount"]);
  const unit = normalizeString(line["unit"] ?? line["units"]);
  const unitPrice = normalizeNumber(
    line["unitPrice"] ?? line["price"] ?? line["rate"] ?? line["unit_cost"] ?? line["cost"],
  );
  const lineTotal = normalizeNumber(line["lineTotal"] ?? line["total"] ?? line["amount"]);

  return {
    description,
    quantity,
    unit,
    unitPrice,
    lineTotal,
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
