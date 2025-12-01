"use server";

import {
  MaterialsListActionResponse,
  MaterialsListInput,
  smartMaterialsForQuote,
} from "@/app/(app)/quotes/new/quoteMaterialsAiActions";

export type GenerateMaterialsForQuoteActionInput = Omit<MaterialsListInput, "description"> & {
  quoteId?: string | null;
  description?: string | null;
};

export type { MaterialsListActionResponse };

export async function generateMaterialsForQuoteAction(
  input: GenerateMaterialsForQuoteActionInput,
): Promise<MaterialsListActionResponse> {
  const descriptionSnippet = (input.description ?? "").slice(0, 80);
  console.log("[materials-action] generateMaterialsForQuoteAction called", {
    quoteId: input.quoteId,
    descriptionSnippet,
  });

  try {
    return await smartMaterialsForQuote({
      description: (input.description ?? "").trim(),
      lineItems: input.lineItems,
      jobId: input.jobId,
      workspaceId: input.workspaceId,
    });
  } catch (error) {
    const normalizedError = error instanceof Error ? error : null;
    const message = normalizedError?.message ?? String(error);
    console.error("[materials-action] generateMaterialsForQuoteAction failed", {
      quoteId: input.quoteId,
      error,
      message,
      stack: normalizedError?.stack,
    });
    console.log("[materials-action-metrics]", {
      event: "materials_action_error",
      quoteId: input.quoteId,
      errorMessage: message,
    });
    return {
      ok: false,
      error: "ai_error",
      message: "We couldn’t generate a materials list. Please try again.",
    };
  }
}
