"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { getAppliedQuoteForJob } from "@/lib/domain/quotes/appliedQuote";
import { buildInvoiceSnapshot, validateAppliedQuoteForJob } from "@/lib/domain/invoicesSnapshot";

type JobRow = {
  id: string;
  title: string | null;
  workspace_id: string | null;
  customer_id: string | null;
  customers:
    | { id: string | null; name: string | null; phone?: string | null; email?: string | null }
    | Array<{ id: string | null; name: string | null; phone?: string | null; email?: string | null }>
    | null;
};

type CreateInvoiceResult = {
  success: boolean;
  code:
    | "ok"
    | "invalid_input"
    | "unauthorized"
    | "job_workspace_mismatch"
    | "missing_applied_quote"
    | "quote_workspace_mismatch"
    | "quote_not_applied"
    | "already_exists"
    | "unknown";
  invoiceId?: string | null;
  jobId: string | null;
  quoteId?: string | null;
  totalCents?: number | null;
};

const createInvoiceSchema = z.object({
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
});

function normalizeSingle<T>(relation: T | T[] | null | undefined): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }
  return relation ?? null;
}

function safeAmount(value: number | null | undefined) {
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

function failureResponse(params: {
  code: CreateInvoiceResult["code"];
  jobId: string | null;
  quoteId?: string | null;
  totalCents?: number | null;
}) {
  return {
    success: false,
    code: params.code,
    jobId: params.jobId,
    quoteId: params.quoteId ?? null,
    totalCents: params.totalCents ?? null,
  } satisfies CreateInvoiceResult;
}

export async function createInvoiceFromAppliedQuoteAction(
  _prevState: CreateInvoiceResult | null,
  formData: FormData,
): Promise<CreateInvoiceResult> {
  const parsed = createInvoiceSchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    jobId: formData.get("jobId"),
  });

  if (!parsed.success) {
    console.error("[invoices-create-failure]", {
      reason: "invalid_input",
      issues: parsed.error.issues.map((issue) => issue.message),
    });
    return failureResponse({ code: "invalid_input", jobId: null });
  }

  const { workspaceId, jobId } = parsed.data;

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[invoices-create-failure]", { workspaceId, jobId, reason: "unknown", error });
    return failureResponse({ code: "unknown", jobId });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error("[invoices-create-failure]", { workspaceId, jobId, reason: "unauthorized" });
    return failureResponse({ code: "unauthorized", jobId });
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[invoices-create-failure]", { workspaceId, jobId, reason: "unauthorized", error });
    return failureResponse({ code: "unauthorized", jobId });
  }

  if (!workspace || workspace.id !== workspaceId) {
    console.error("[invoices-create-failure]", { workspaceId, jobId, reason: "unauthorized" });
    return failureResponse({ code: "unauthorized", jobId });
  }

  const { data: job, error: jobError } = await supabase
    .from<JobRow>("jobs")
    .select("id, title, workspace_id, customer_id, customers(id, name, phone, email)")
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (jobError || !job) {
    console.error("[invoices-create-failure]", {
      workspaceId,
      jobId,
      reason: "job_workspace_mismatch",
      error: jobError ?? null,
    });
    return failureResponse({ code: "job_workspace_mismatch", jobId });
  }

  const appliedQuoteResult = await getAppliedQuoteForJob({
    supabase,
    workspaceId,
    jobId,
  });

  const appliedQuote = appliedQuoteResult.ok ? appliedQuoteResult.quote : null;

  console.log("[invoices-create-request]", {
    workspaceId,
    jobId,
    hasAppliedQuote: Boolean(appliedQuote),
    quoteId: appliedQuote?.id ?? null,
  });

  if (!appliedQuoteResult.ok) {
    console.error("[invoices-create-failure]", {
      workspaceId,
      jobId,
      reason: appliedQuoteResult.reason,
    });
    return failureResponse({ code: appliedQuoteResult.reason, jobId });
  }

  const { data: existingInvoice, error: invoiceLookupError } = await supabase
    .from("invoices")
    .select("id, quote_id, total_cents")
    .eq("workspace_id", workspaceId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (invoiceLookupError) {
    console.error("[invoices-create-failure]", {
      workspaceId,
      jobId,
      reason: "unknown",
      error: invoiceLookupError,
    });
    return failureResponse({ code: "unknown", jobId });
  }

  if (existingInvoice) {
    console.error("[invoices-create-failure]", {
      workspaceId,
      jobId,
      reason: "already_exists",
      invoiceId: existingInvoice.id ?? null,
    });
    return {
      success: false,
      code: "already_exists",
      invoiceId: existingInvoice.id ?? null,
      jobId,
      quoteId: existingInvoice.quote_id ?? null,
      totalCents: existingInvoice.total_cents ?? null,
    };
  }

  const validation = validateAppliedQuoteForJob({
    workspaceId,
    jobId,
    jobWorkspaceId: job.workspace_id ?? null,
    appliedQuote,
  });

  if (!validation.ok) {
    console.error("[invoices-create-failure]", {
      workspaceId,
      jobId,
      reason: validation.reason,
      quoteId: appliedQuote.id,
    });
    return failureResponse({
      code: validation.reason,
      jobId,
      quoteId: appliedQuote.id,
    });
  }

  const subtotalValue = safeAmount(appliedQuote.subtotal);
  const taxValue = safeAmount(appliedQuote.tax);
  const totalValue = safeAmount(appliedQuote.total ?? subtotalValue + taxValue);

  const snapshot = buildInvoiceSnapshot({
    workspaceId,
    job,
    customer: normalizeSingle(job.customers),
    appliedQuote,
    pricing: {
      laborTotalCents: amountToCents(subtotalValue),
      materialsTotalCents: 0,
      tripFeeCents: 0,
      taxTotalCents: amountToCents(taxValue),
      totalCents: amountToCents(totalValue),
      currency: "USD",
    },
  });

  const { data: invoice, error: insertError } = await supabase
    .from("invoices")
    .insert({
      workspace_id: workspaceId,
      job_id: job.id,
      quote_id: appliedQuote.id,
      user_id: user.id,
      status: "draft",
      subtotal: subtotalValue,
      tax: taxValue,
      total: totalValue,
      customer_name: snapshot.customer_name_snapshot,
      customer_email: normalizeSingle(job.customers)?.email ?? null,
      ...snapshot,
    })
    .select("id")
    .single();

  if (insertError || !invoice) {
    console.error("[invoices-create-failure]", {
      workspaceId,
      jobId,
      reason: "unknown",
      error: insertError,
    });
    return failureResponse({
      code: "unknown",
      jobId,
      quoteId: appliedQuote.id,
      totalCents: snapshot.total_cents,
    });
  }

  console.log("[invoices-create-success]", {
    workspaceId,
    jobId,
    invoiceId: invoice.id,
    quoteId: appliedQuote.id,
    totalCents: snapshot.total_cents,
  });

  return {
    success: true,
    code: "ok",
    invoiceId: invoice.id,
    jobId,
    quoteId: appliedQuote.id,
    totalCents: snapshot.total_cents,
  };
}
