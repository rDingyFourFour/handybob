"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  SmartFollowupActionResponse,
  smartFollowupFromQuote,
} from "@/app/(app)/quotes/[id]/followupAiActions";

export type SmartFollowupFromCallSummaryInput = {
  supabaseClient: SupabaseClient;
  workspaceId: string;
  jobId: string;
  quoteId: string;
  summaryNote: string;
  outcome: string | null;
};

export async function smartFollowupFromCallSummary({
  supabaseClient,
  summaryNote,
  outcome,
  workspaceId,
  jobId,
  quoteId,
}: SmartFollowupFromCallSummaryInput): Promise<SmartFollowupActionResponse> {
  void supabaseClient;
  const normalizedSummary = summaryNote?.trim() ?? "";
  const composedDescription = [
    normalizedSummary,
    outcome ? `Outcome: ${outcome.replace(/_/g, " ")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const response = await smartFollowupFromQuote({
    description: composedDescription,
    quoteId,
    jobId,
    workspaceId,
    status: null,
    totalAmount: null,
    customerName: null,
    daysSinceQuote: null,
  });

  return response;
}

export type NextActionSuggestion = {
  type: "call_again" | "send_sms" | "send_email" | "close_lost" | "do_nothing";
  label: string;
  reason: string;
  timingHint?: string;
  channelHint?: "phone" | "sms" | "email";
};

export async function smartNextActionFromCallSummary({
  supabaseClient,
  workspaceId: _workspaceId,
  jobId: _jobId,
  quoteId: _quoteId,
  outcome,
  summaryNote,
}: SmartFollowupFromCallSummaryInput): Promise<NextActionSuggestion | null> {
  void supabaseClient;
  // CHANGE: Silencing unused identifier warnings until these IDs are required.
  void _workspaceId;
  void _jobId;
  void _quoteId;
  const normalizedOutcome = outcome?.toLowerCase() ?? "";
  const normalizedNote = summaryNote?.trim() ?? "";

  if (normalizedOutcome.includes("call_rescheduled")) {
    return {
      type: "call_again",
      label: "Call again in 2 days",
      reason: "Customer asked for a follow-up, so try reaching out again shortly.",
      timingHint: "in 2 days",
      channelHint: "phone",
    };
  }
  if (normalizedOutcome.includes("left_voicemail") || normalizedOutcome.includes("no_answer")) {
    return {
      type: "send_sms",
      label: "Send a quick SMS recap",
      reason: "We weren’t able to reach them, so a text recap keeps things moving.",
      timingHint: "later today",
      channelHint: "sms",
    };
  }
  if (normalizedOutcome.includes("talked_to_customer") && normalizedNote.toLowerCase().includes("ready")) {
    return {
      type: "send_email",
      label: "Confirm details via email",
      reason: "Customer sounds ready; summarize next steps via email.",
      channelHint: "email",
    };
  }
  if (normalizedOutcome.includes("lost") || normalizedOutcome.includes("call_rescheduled")) {
    return {
      type: "close_lost",
      label: "Document as lost/paused",
      reason: "Outcome suggests we should close or pause this quote.",
    };
  }
  if (normalizedNote) {
    return {
      type: "call_again",
      label: "Follow up with a quick call",
      reason: `Summary says: ${normalizedNote}`,
      channelHint: "phone",
    };
  }
  return {
    type: "do_nothing",
    label: "No immediate action",
    reason: "Summary didn't include a clear next step.",
  };
}
