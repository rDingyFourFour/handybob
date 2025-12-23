import type { SupabaseClient } from "@supabase/supabase-js";

import { buildInvoiceSnapshot, type InvoiceSnapshot } from "@/lib/domain/invoices/invoiceSnapshot";

type JobRow = {
  id: string;
  title: string | null;
  workspace_id: string | null;
};

type QuoteRow = {
  id: string;
  job_id: string | null;
  workspace_id: string | null;
  status: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
};

type CreateInvoiceArgs = {
  supabase: SupabaseClient;
  workspaceId: string;
  jobId: string;
  quoteId: string;
  userId: string;
};

type CreateInvoiceFailureCode =
  | "quote_not_found"
  | "quote_not_accepted"
  | "job_not_found"
  | "already_exists"
  | "forbidden"
  | "unknown_error";

type CreateInvoiceResult =
  | { ok: true; invoice: InvoiceSnapshot & { id: string } }
  | { ok: false; code: CreateInvoiceFailureCode };

function safeNumber(value: number | null | undefined) {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized)) return 0;
  return normalized < 0 ? 0 : normalized;
}

function amountToCents(value: number) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 0;
  const cents = Math.round(normalized * 100);
  return cents < 0 ? 0 : cents;
}

export async function createInvoiceFromAcceptedQuote(
  args: CreateInvoiceArgs,
): Promise<CreateInvoiceResult> {
  const { supabase, workspaceId, jobId, quoteId, userId } = args;

  const { data: job, error: jobError } = await supabase
    .from<JobRow>("jobs")
    .select("id, title, workspace_id")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) {
    console.error("[invoice-from-accepted-quote] job lookup failed", {
      workspaceId,
      jobId,
      error: jobError,
    });
    return { ok: false, code: "unknown_error" };
  }

  if (!job) {
    return { ok: false, code: "job_not_found" };
  }

  if (job.workspace_id && job.workspace_id !== workspaceId) {
    return { ok: false, code: "forbidden" };
  }

  const { data: quote, error: quoteError } = await supabase
    .from<QuoteRow>("quotes")
    .select("id, job_id, workspace_id, status, subtotal, tax, total")
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteError) {
    console.error("[invoice-from-accepted-quote] quote lookup failed", {
      workspaceId,
      jobId,
      quoteId,
      error: quoteError,
    });
    return { ok: false, code: "unknown_error" };
  }

  if (!quote) {
    return { ok: false, code: "quote_not_found" };
  }

  if (quote.workspace_id && quote.workspace_id !== workspaceId) {
    return { ok: false, code: "forbidden" };
  }

  if (quote.job_id && quote.job_id !== jobId) {
    return { ok: false, code: "forbidden" };
  }

  if (quote.status?.toLowerCase() !== "accepted") {
    return { ok: false, code: "quote_not_accepted" };
  }

  const { data: existingInvoice, error: existingInvoiceError } = await supabase
    .from("invoices")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingInvoiceError) {
    console.error("[invoice-from-accepted-quote] invoice lookup failed", {
      workspaceId,
      jobId,
      quoteId,
      error: existingInvoiceError,
    });
    return { ok: false, code: "unknown_error" };
  }

  if (existingInvoice?.id) {
    return { ok: false, code: "already_exists" };
  }

  const subtotalValue = safeNumber(quote.subtotal);
  const taxValue = safeNumber(quote.tax);
  const totalValue = safeNumber(quote.total ?? subtotalValue + taxValue);

  const snapshot = buildInvoiceSnapshot({
    workspaceId,
    jobId,
    quoteId: quote.id,
    currency: "USD",
    subtotalCents: amountToCents(subtotalValue),
    taxCents: amountToCents(taxValue),
    totalCents: amountToCents(totalValue),
    summary: job.title ?? null,
  });

  const { data: invoice, error: insertError } = await supabase
    .from("invoices")
    .insert({
      workspace_id: workspaceId,
      job_id: jobId,
      quote_id: quote.id,
      user_id: userId,
      invoice_status: "draft",
      status: "draft",
      subtotal: subtotalValue,
      tax: taxValue,
      total: totalValue,
      ...snapshot,
    })
    .select(
      "id, workspace_id, job_id, quote_id, currency, snapshot_subtotal_cents, snapshot_tax_cents, snapshot_total_cents, snapshot_summary"
    )
    .single();

  if (insertError || !invoice) {
    console.error("[invoice-from-accepted-quote] insert failed", {
      workspaceId,
      jobId,
      quoteId,
      error: insertError,
    });
    return { ok: false, code: "unknown_error" };
  }

  return {
    ok: true,
    invoice: invoice as InvoiceSnapshot & { id: string },
  };
}
