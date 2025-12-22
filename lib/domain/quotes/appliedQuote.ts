import type { SupabaseClient } from "@supabase/supabase-js";

type AppliedQuoteRow = {
  id: string;
  job_id: string | null;
  workspace_id: string | null;
  status: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  client_message_template: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AppliedQuoteResult =
  | { ok: true; quote: AppliedQuoteRow }
  | { ok: false; reason: "missing_applied_quote" | "quote_not_applied" | "unknown" };

type AppliedQuoteLookupArgs = {
  supabase: SupabaseClient;
  workspaceId: string;
  jobId: string;
};

export async function getAppliedQuoteForJob({
  supabase,
  workspaceId,
  jobId,
}: AppliedQuoteLookupArgs): Promise<AppliedQuoteResult> {
  try {
    const { data: appliedQuote, error } = await supabase
      .from<AppliedQuoteRow>("quotes")
      .select(
        `
          id,
          job_id,
          workspace_id,
          status,
          subtotal,
          tax,
          total,
          client_message_template,
          created_at,
          updated_at
        `
      )
      .eq("workspace_id", workspaceId)
      .eq("job_id", jobId)
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[applied-quote] Failed to load applied quote", error);
      return { ok: false, reason: "unknown" };
    }

    if (appliedQuote) {
      return { ok: true, quote: appliedQuote };
    }

    const { data: latestQuote, error: latestError } = await supabase
      .from<AppliedQuoteRow>("quotes")
      .select("id, job_id, workspace_id, status, created_at")
      .eq("workspace_id", workspaceId)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      console.error("[applied-quote] Failed to load latest quote", latestError);
      return { ok: false, reason: "unknown" };
    }

    if (latestQuote) {
      return { ok: false, reason: "quote_not_applied" };
    }

    return { ok: false, reason: "missing_applied_quote" };
  } catch (error) {
    console.error("[applied-quote] Unexpected lookup error", error);
    return { ok: false, reason: "unknown" };
  }
}
