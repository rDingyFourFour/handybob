"use server";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import {
  OutboundCallScriptInput,
  OutboundCallScriptResult,
  smartOutboundCallScriptFromContext,
} from "@/app/(app)/calls/outboundCallAiActions";

export type GenerateCallScriptForQuoteActionInput = {
  quoteId: string;
};

export type CallScriptActionErrorType =
  | "ai_disabled"
  | "ai_error"
  | "not_found"
  | "unauthorized";

export type CallScriptActionResponse =
  | { ok: true; data: OutboundCallScriptResult }
  | { ok: false; error: CallScriptActionErrorType; message: string };

const CALL_SCRIPT_ERROR_MESSAGE =
  "We couldn’t generate a call script. Please try again or write your own notes manually.";

const QUOTE_NOT_FOUND_MESSAGE = "We couldn’t find that quote. Please try again.";

type QuoteRecord = {
  id: string;
  workspace_id: string;
  job_id: string | null;
  status: string | null;
  total: number | null;
  client_message_template: string | null;
  created_at: string | null;
};

type JobRecord = {
  id: string;
  workspace_id: string;
  title: string | null;
  description_raw: string | null;
  customer_id: string | null;
};

type CustomerRecord = {
  id: string;
  workspace_id: string;
  name: string | null;
};

// CHANGE: add logging helpers for action
function logCallScriptActionDebug(message: string, data?: unknown) {
  if (data !== undefined) {
    console.log("[call-script-action]", message, data);
    return;
  }
  console.log("[call-script-action]", message);
}

function logCallScriptActionMetrics(data: Record<string, unknown>) {
  console.log("[call-script-action-metrics]", data);
}

function calculateDaysSinceQuote(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs <= 0) {
    return 0;
  }
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function buildDescriptionSnippet(
  quote: QuoteRecord,
  job: JobRecord | null
): string {
  const parts = [
    quote.client_message_template?.trim(),
    job?.title?.trim(),
    job?.description_raw?.trim(),
  ].filter((part): part is string => Boolean(part));
  if (parts.length > 0) {
    return parts.join(" · ");
  }
  if (job?.title) {
    return job.title;
  }
  if (quote.client_message_template) {
    return quote.client_message_template.trim();
  }
  return "Quote details";
}

function extractFirstName(fullName?: string | null): string | null {
  if (!fullName) {
    return null;
  }
  const trimmed = fullName.trim();
  if (!trimmed) {
    return null;
  }
  const [first] = trimmed.split(/\s+/);
  return first || null;
}

// CHANGE: create server action wrapper for outbound call script
export async function generateCallScriptForQuoteAction(
  input: GenerateCallScriptForQuoteActionInput
): Promise<CallScriptActionResponse> {
  const quoteId = input.quoteId?.trim();
  if (!quoteId) {
    logCallScriptActionDebug("quoteId validation failed");
    logCallScriptActionMetrics({
      event: "call_script_action_error",
      quoteId: input.quoteId,
      errorType: "not_found",
    });
    return {
      ok: false,
      error: "not_found",
      message: QUOTE_NOT_FOUND_MESSAGE,
    };
  }

  try {
    const supabase = await createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logCallScriptActionDebug("unauthorized – missing user");
      logCallScriptActionMetrics({
        event: "call_script_action_error",
        quoteId,
        errorType: "unauthorized",
      });
      return {
        ok: false,
        error: "unauthorized",
        message: "Sign in to generate a call script.",
      };
    }

    const workspaceResult = await getCurrentWorkspace({ supabase });
    const workspace = workspaceResult.workspace;
    if (!workspace) {
      logCallScriptActionDebug("workspace not found for action");
      logCallScriptActionMetrics({
        event: "call_script_action_error",
        quoteId,
        errorType: "not_found",
      });
      return {
        ok: false,
        error: "not_found",
        message: QUOTE_NOT_FOUND_MESSAGE,
      };
    }

    const { data: quote, error: quoteError } = await supabase
      .from<QuoteRecord>("quotes")
      .select(
        `
          id,
          workspace_id,
          job_id,
          status,
          total,
          client_message_template,
          created_at
        `
      )
      .eq("workspace_id", workspace.id)
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteError) {
      console.error("[call-script-action] quote lookup failed", quoteError);
    }

    if (!quote) {
      logCallScriptActionDebug("quote not found");
      logCallScriptActionMetrics({
        event: "call_script_action_error",
        quoteId,
        workspaceId: workspace.id,
        errorType: "not_found",
      });
      return {
        ok: false,
        error: "not_found",
        message: QUOTE_NOT_FOUND_MESSAGE,
      };
    }

    const job =
      quote.job_id !== null
        ? (
            await supabase
              .from<JobRecord>("jobs")
              .select("id, workspace_id, title, description_raw, customer_id")
              .eq("workspace_id", workspace.id)
              .eq("id", quote.job_id)
              .maybeSingle()
          ).data ?? null
        : null;

    const customer =
      job?.customer_id
        ? (
            await supabase
              .from<CustomerRecord>("customers")
              .select("id, workspace_id, name")
              .eq("workspace_id", workspace.id)
              .eq("id", job.customer_id)
              .maybeSingle()
          ).data ?? null
        : null;

    const description = buildDescriptionSnippet(quote, job);
    const totalAmount =
      typeof quote.total === "number"
        ? quote.total
        : Number.isFinite(Number(quote.total)) ? Number(quote.total) : 0;
    const daysSinceQuote = Math.max(calculateDaysSinceQuote(quote.created_at) ?? 0, 0);
    const statusLabel = quote.status ?? "draft";

    logCallScriptActionDebug("generateCallScriptForQuoteAction called", {
      quoteId: quote.id,
      jobId: quote.job_id,
      workspaceId: workspace.id,
      status: statusLabel,
      totalAmount,
      daysSinceQuote,
    });
    console.log("[call-script-metrics]", {
      event: "call_script_start",
      quoteId: quote.id,
      jobId: quote.job_id,
      workspaceId: workspace.id,
      status: statusLabel,
      totalAmount,
      daysSinceQuote,
    });
    logCallScriptActionMetrics({
      event: "call_script_action_start",
      quoteId: quote.id,
      jobId: quote.job_id,
      workspaceId: workspace.id,
      status: statusLabel,
      totalAmount,
      daysSinceQuote,
    });

    const payload: OutboundCallScriptInput = {
      description,
      status: statusLabel,
      totalAmount,
      daysSinceQuote,
      jobId: quote.job_id,
      quoteId: quote.id,
      workspaceId: workspace.id,
      customerName: customer?.name ?? null,
      customerFirstName: extractFirstName(customer?.name),
    };

    const response = await smartOutboundCallScriptFromContext(payload);

    if (response.ok) {
      logCallScriptActionDebug("call script helper succeeded", {
        channelSuggestion: response.data.channelSuggestion,
      });
      console.log("[call-script-metrics]", {
        event: "call_script_success",
        quoteId: quote.id,
        jobId: quote.job_id,
        workspaceId: workspace.id,
        subjectLength: response.data.subject.length,
        keyPointsCount: Array.isArray(response.data.keyPoints)
          ? response.data.keyPoints.length
          : 0,
      });
      logCallScriptActionMetrics({
        event: "call_script_action_success",
        quoteId: quote.id,
        jobId: quote.job_id,
        workspaceId: workspace.id,
        status: statusLabel,
        totalAmount,
        daysSinceQuote,
      });
      return {
        ok: true,
        data: response.data,
      };
    }

      logCallScriptActionDebug("call script helper returned error", {
        error: response.error,
      });
      console.log("[call-script-metrics]", {
        event: "call_script_error",
        errorType: response.error,
        quoteId: quote.id,
        jobId: quote.job_id,
        workspaceId: workspace.id,
      });
      logCallScriptActionMetrics({
        event: "call_script_action_error",
        quoteId: quote.id,
        jobId: quote.job_id,
        workspaceId: workspace.id,
        status: statusLabel,
        totalAmount,
        daysSinceQuote,
        errorType: response.error,
      });
    return {
      ok: false,
      error: response.error,
      message: response.message,
    };
  } catch (error) {
    const normalized = error instanceof Error ? error : null;
    console.error("[call-script-action] Unexpected error", {
      message: normalized?.message ?? error,
      stack: normalized?.stack,
    });
    console.log("[call-script-metrics]", {
      event: "call_script_error",
      errorType: "ai_error",
      quoteId,
    });
    logCallScriptActionMetrics({
      event: "call_script_action_error",
      errorType: "ai_error",
    });
    return {
      ok: false,
      error: "ai_error",
      message: CALL_SCRIPT_ERROR_MESSAGE,
    };
  }
}
