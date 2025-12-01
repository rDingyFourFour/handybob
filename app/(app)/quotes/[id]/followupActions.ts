"use server";

import {
  SmartFollowupActionResponse,
  smartFollowupFromQuote,
} from "@/app/(app)/quotes/[id]/followupAiActions";

export type GenerateFollowupForQuoteActionInput = {
  quoteId: string;
  description: string;
  jobId?: string | null;
  workspaceId?: string | null;
  status?: string | null;
  totalAmount?: number | null;
  customerName?: string | null;
  daysSinceQuote?: number | null;
};

export type GenerateFollowupForQuoteActionResult = SmartFollowupActionResponse;

export async function generateFollowupForQuoteAction(
  input: GenerateFollowupForQuoteActionInput
): Promise<GenerateFollowupForQuoteActionResult> {
  const descriptionSnippet = input.description?.slice(0, 80) ?? "";
  console.log("[followup-action] generateFollowupForQuoteAction called", {
    quoteId: input.quoteId,
    jobId: input.jobId,
    workspaceId: input.workspaceId,
    status: input.status,
    totalAmount: input.totalAmount,
    daysSinceQuote: input.daysSinceQuote,
    descriptionSnippet,
  });

  try {
    const response = await smartFollowupFromQuote({
      description: input.description,
      quoteId: input.quoteId,
      jobId: input.jobId ?? null,
      workspaceId: input.workspaceId ?? null,
      status: input.status ?? null,
      totalAmount: input.totalAmount ?? null,
      customerName: input.customerName ?? null,
      daysSinceQuote: input.daysSinceQuote ?? null,
    });

    console.log("[followup-action] generateFollowupForQuoteAction result", {
      quoteId: input.quoteId,
      ok: response.ok,
      channelSuggestion: response.ok ? response.data.channelSuggestion ?? null : null,
      subjectLength: response.ok ? response.data.subject.length : null,
      error: response.ok ? null : response.error,
    });

    return response;
  } catch (error) {
    const normalizedError = error instanceof Error ? error : null;
    console.error("[followup-action] generateFollowupForQuoteAction failed", {
      quoteId: input.quoteId,
      error,
      message: normalizedError?.message,
      stack: normalizedError?.stack,
    });
    return {
      ok: false,
      error: "ai_error",
      message: "We couldn’t generate a follow-up message. Please try again or write one manually.",
    };
  }
}
