"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { resolveWorkspaceContext } from "@/lib/domain/workspaces";

export type AcceptQuoteResult = {
  ok: boolean;
  code:
    | "accepted"
    | "already_accepted"
    | "invalid_input"
    | "unauthenticated"
    | "forbidden"
    | "workspace_not_found"
    | "not_found"
    | "wrong_workspace"
    | "accepted_conflict"
    | "update_failed"
    | "unknown";
  message?: string | null;
  quoteId: string | null;
  jobId: string | null;
};

const acceptQuoteSchema = z.object({
  workspaceId: z.string().min(1),
  quoteId: z.string().min(1),
});

type QuoteRow = {
  id: string;
  workspace_id: string | null;
  user_id: string | null;
  job_id: string | null;
  status: string | null;
  accepted_at?: string | null;
};

function failureResult(params: {
  code: AcceptQuoteResult["code"];
  message?: string | null;
  quoteId?: string | null;
  jobId?: string | null;
}): AcceptQuoteResult {
  return {
    ok: false,
    code: params.code,
    message: params.message ?? null,
    quoteId: params.quoteId ?? null,
    jobId: params.jobId ?? null,
  };
}

export async function acceptQuoteAction(
  _prevState: AcceptQuoteResult | null,
  formData: FormData,
): Promise<AcceptQuoteResult> {
  const parsed = acceptQuoteSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    quoteId: formData.get("quoteId"),
  });

  if (!parsed.success) {
    console.error("[quotes-accept-action-failure]", {
      reason: "invalid_input",
      issues: parsed.error.issues.map((issue) => issue.message),
    });
    return failureResult({
      code: "invalid_input",
      message: "We couldn’t accept this quote. Please try again.",
    });
  }

  const { workspaceId, quoteId } = parsed.data;

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[quotes-accept-action-failure]", {
      workspaceId,
      quoteId,
      reason: "unknown",
      error,
    });
    return failureResult({
      code: "unknown",
      message: "We couldn’t accept this quote. Please try again.",
      quoteId,
    });
  }

  const workspaceResult = await resolveWorkspaceContext({
    supabase,
    allowAutoCreateWorkspace: false,
  });
  if (!workspaceResult.ok) {
    const code =
      workspaceResult.code === "unauthenticated"
        ? "unauthenticated"
        : workspaceResult.code === "workspace_not_found"
        ? "workspace_not_found"
        : workspaceResult.code === "no_membership"
        ? "forbidden"
        : "workspace_not_found";
    console.error("[quotes-accept-action-failure]", {
      workspaceId,
      quoteId,
      reason: code,
    });
    return failureResult({
      code,
      message: "You no longer have access to accept this quote.",
      quoteId,
    });
  }

  const { workspace } = workspaceResult.membership;
  if (workspace.id !== workspaceId) {
    console.error("[quotes-accept-action-failure]", {
      workspaceId,
      quoteId,
      reason: "forbidden",
    });
    return failureResult({
      code: "forbidden",
      message: "You no longer have access to accept this quote.",
      quoteId,
    });
  }

  let quote: QuoteRow | null = null;

  try {
    const { data, error } = await supabase
      .from<QuoteRow>("quotes")
      .select("id, workspace_id, user_id, job_id, status, accepted_at")
      .eq("workspace_id", workspaceId)
      .eq("id", quoteId)
      .maybeSingle();

    if (error) {
      console.error("[quotes-accept-action-failure]", {
        workspaceId,
        quoteId,
        reason: "unknown",
        error,
      });
      return failureResult({
        code: "unknown",
        message: "We couldn’t accept this quote. Please try again.",
        quoteId,
      });
    }

    quote = data ?? null;
  } catch (error) {
    console.error("[quotes-accept-action-failure]", {
      workspaceId,
      quoteId,
      reason: "unknown",
      error,
    });
    return failureResult({
      code: "unknown",
      message: "We couldn’t accept this quote. Please try again.",
      quoteId,
    });
  }

  if (!quote) {
    const { data: otherQuote } = await supabase
      .from<QuoteRow>("quotes")
      .select("id, workspace_id, job_id")
      .eq("id", quoteId)
      .maybeSingle();
    const reason = otherQuote ? "wrong_workspace" : "not_found";
    console.error("[quotes-accept-action-failure]", {
      workspaceId,
      quoteId,
      reason,
    });
    return failureResult({
      code: reason,
      message: reason === "wrong_workspace" ? "Quote is not in this workspace." : "Quote not found.",
      quoteId,
      jobId: otherQuote?.job_id ?? null,
    });
  }

  console.log("[quotes-accept-action-request]", {
    workspaceId,
    quoteId: quote.id,
    jobId: quote.job_id ?? null,
  });

  if (quote.status?.toLowerCase() === "accepted") {
    console.log("[quotes-accept-action-success]", {
      workspaceId,
      quoteId: quote.id,
      jobId: quote.job_id ?? null,
      code: "already_accepted",
    });
    return {
      ok: true,
      code: "already_accepted",
      message: "This quote is already accepted.",
      quoteId: quote.id,
      jobId: quote.job_id ?? null,
    };
  }

  if (quote.job_id) {
    const { data: existingAccepted } = await supabase
      .from<QuoteRow>("quotes")
      .select("id, job_id, status")
      .eq("workspace_id", workspaceId)
      .eq("job_id", quote.job_id)
      .eq("status", "accepted")
      .not("id", "eq", quote.id)
      .maybeSingle();

    if (existingAccepted) {
      console.error("[quotes-accept-action-failure]", {
        workspaceId,
        quoteId: quote.id,
        jobId: quote.job_id,
        reason: "accepted_conflict",
      });
      return failureResult({
        code: "accepted_conflict",
        message: "Another quote for this job is already accepted.",
        quoteId: quote.id,
        jobId: quote.job_id,
      });
    }
  }

  const updatePayload: Record<string, string> = {
    status: "accepted",
  };

  if (!quote.accepted_at) {
    updatePayload.accepted_at = new Date().toISOString();
  }

  const { data: updatedQuote, error: updateError } = await supabase
    .from<QuoteRow>("quotes")
    .update(updatePayload)
    .eq("workspace_id", workspaceId)
    .eq("id", quote.id)
    .select("id, job_id, status")
    .single();

  if (updateError || !updatedQuote) {
    console.error("[quotes-accept-action-failure]", {
      workspaceId,
      quoteId: quote.id,
      jobId: quote.job_id ?? null,
      reason: "update_failed",
      error: updateError,
    });
    return failureResult({
      code: "update_failed",
      message: "We couldn’t accept this quote. Please try again.",
      quoteId: quote.id,
      jobId: quote.job_id ?? null,
    });
  }

  console.log("[quotes-accept-action-success]", {
    workspaceId,
    quoteId: updatedQuote.id,
    jobId: updatedQuote.job_id ?? null,
    code: "accepted",
  });

  return {
    ok: true,
    code: "accepted",
    message: "Quote accepted.",
    quoteId: updatedQuote.id,
    jobId: updatedQuote.job_id ?? null,
  };
}
