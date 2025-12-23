import type { SupabaseClient } from "@supabase/supabase-js";

export type InvoiceSnapshotRow = {
  id: string;
  workspace_id: string | null;
  job_id: string | null;
  quote_id: string | null;
  currency: string | null;
  snapshot_subtotal_cents: number | null;
  snapshot_tax_cents: number | null;
  snapshot_total_cents: number | null;
  snapshot_summary: string | null;
  created_at: string | null;
  invoice_status: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
};

export async function getInvoiceForJob(args: {
  supabase: SupabaseClient;
  workspaceId: string;
  jobId: string;
}): Promise<{ invoice: InvoiceSnapshotRow | null; error: unknown | null }> {
  const { supabase, workspaceId, jobId } = args;
  try {
    const { data, error } = await supabase
      .from<InvoiceSnapshotRow>("invoices")
      .select(
        `
          id,
          workspace_id,
          job_id,
          quote_id,
          currency,
          snapshot_subtotal_cents,
          snapshot_tax_cents,
          snapshot_total_cents,
          snapshot_summary,
          created_at,
          invoice_status,
          sent_at,
          paid_at,
          voided_at
        `
      )
      .eq("workspace_id", workspaceId)
      .eq("job_id", jobId)
      .maybeSingle();

    if (error) {
      console.error("[invoice-for-job] Failed to load invoice", { workspaceId, jobId, error });
      return { invoice: null, error };
    }

    return { invoice: data ?? null, error: null };
  } catch (error) {
    console.error("[invoice-for-job] Unexpected invoice lookup error", { workspaceId, jobId, error });
    return { invoice: null, error };
  }
}
