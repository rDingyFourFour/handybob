"use server";

// Invoice domain: runs under RLS via createServerClient/getCurrentWorkspace so all inserts/updates respect workspace_id.
// Entry points: `createInvoiceFromQuote` (server action) and `ensureInvoiceForQuote` (called from webhook handlers).
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/utils/supabase/server";
import { logAuditEvent } from "@/utils/audit/log";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";

type QuoteLineItem = Record<string, unknown>;

type CustomerInfo = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

type JobWithCustomer = {
  id?: string | null;
  title: string | null;
  customers: CustomerInfo | CustomerInfo[] | null;
};

type QuoteForInvoice = {
  id: string;
  total: number | null;
  status: string | null;
  user_id: string | null;
  workspace_id: string | null;
  paid_at: string | null;
  stripe_payment_link_url: string | null;
  job_id: string | null;
  subtotal: number | null;
  tax: number | null;
  line_items: QuoteLineItem[] | null;
  jobs:
    | {
        title: string | null;
        customers:
          | {
              name: string | null;
              email: string | null;
              phone?: string | null;
            }
          | {
              name: string | null;
              email: string | null;
              phone?: string | null;
            }[]
          | null;
      }
    | {
        title: string | null;
        customers:
          | {
              name: string | null;
              email: string | null;
              phone?: string | null;
            }
          | {
              name: string | null;
              email: string | null;
              phone?: string | null;
            }[]
          | null;
      }[]
    | null;
};

type EnsureInvoiceArgs = {
  supabase: SupabaseClient;
  quoteId: string;
  markPaid?: boolean;
  paidAt?: string | null;
  paymentIntentId?: string | null;
};

function normalizeSingle<T>(relation: T | T[] | null | undefined): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }
  return relation ?? null;
}

function firstCustomer(job: QuoteForInvoice["jobs"]): { name: string | null; email: string | null } | null {
  if (!job) return null;
  const normalizedJob = Array.isArray(job) ? job[0] : job;
  if (!normalizedJob?.customers) return null;
  if (Array.isArray(normalizedJob.customers)) {
    return normalizedJob.customers[0] ?? null;
  }
  return normalizedJob.customers;
}

export async function createInvoiceFromQuote(formData: FormData) {
  const quoteId = String(formData.get("quote_id"));
  const supabase = await createServerClient();

  const { user, workspace } = await getCurrentWorkspace({ supabase });

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      `
        id,
        user_id,
        workspace_id,
        job_id,
        status,
        subtotal,
        tax,
        total,
        line_items,
        stripe_payment_link_url,
        jobs (
          title,
          customers (
            name,
            email,
            phone
          )
        )
      `
    )
    .eq("id", quoteId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!quote) {
    throw new Error("Quote not found");
  }

  const job = normalizeSingle<JobWithCustomer>(
    (quote.jobs as JobWithCustomer | JobWithCustomer[] | null) ?? null
  );
  const customer = normalizeSingle<CustomerInfo>(job?.customers);

  const status = quote.status === "accepted" || quote.status === "paid" ? "sent" : "draft";

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      quote_id: quote.id,
      user_id: quote.user_id ?? user.id,
      workspace_id: quote.workspace_id ?? workspace.id,
      job_id: quote.job_id ?? null,
      status,
      subtotal: Number(quote.subtotal ?? 0),
      tax: Number(quote.tax ?? 0),
      total: Number(quote.total ?? 0),
      line_items: (quote.line_items as QuoteLineItem[] | null) ?? [],
      customer_name: customer?.name ?? null,
      customer_email: customer?.email ?? null,
      stripe_payment_link_url: quote.stripe_payment_link_url ?? null,
    })
    .select("id")
    .single();

  if (error || !invoice) {
    throw new Error(error?.message || "Failed to create invoice");
  }

  await logAuditEvent({
    supabase,
    workspaceId: quote.workspace_id ?? workspace.id,
    actorUserId: user.id,
    action: "invoice_created",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: { quote_id: quote.id, total: quote.total },
  });

  redirect(`/invoices/${invoice.id}`);
}

export async function ensureInvoiceForQuote({
  supabase,
  quoteId,
  markPaid = false,
  paidAt,
  paymentIntentId,
}: EnsureInvoiceArgs) {
  const { data: existingInvoice, error: existingError } = await supabase
    .from("invoices")
    .select("*")
    .eq("quote_id", quoteId)
    .maybeSingle();

  if (existingError) {
    console.error(
      "[ensureInvoiceForQuote] Failed to check existing invoice",
      quoteId,
      existingError.message
    );
    return null;
  }

  const now = new Date().toISOString();

  if (existingInvoice) {
    if (!markPaid) {
      return existingInvoice;
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: now,
    };

    if (markPaid) {
      updatePayload.status = "paid";
      updatePayload.paid_at = paidAt ?? now;
    }

    if (paymentIntentId) {
      updatePayload.stripe_payment_intent_id = paymentIntentId;
    }

    const { data: quoteForLink } = await supabase
      .from("quotes")
      .select("stripe_payment_link_url")
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteForLink?.stripe_payment_link_url) {
      updatePayload.stripe_payment_link_url = quoteForLink.stripe_payment_link_url;
    }

    const { data: updatedInvoice, error: invoiceUpdateError } = await supabase
      .from("invoices")
      .update(updatePayload)
      .eq("id", existingInvoice.id)
      .select("*")
      .maybeSingle();

    if (invoiceUpdateError) {
      console.error(
        "[ensureInvoiceForQuote] Failed to update invoice",
        existingInvoice.id,
        invoiceUpdateError.message
      );
      return existingInvoice;
    }

    return updatedInvoice;
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select(
      `
        id,
        total,
        status,
        user_id,
        workspace_id,
        paid_at,
        stripe_payment_link_url,
        job_id,
        subtotal,
        tax,
        line_items,
        jobs (
          title,
          customers (
            name,
            email,
            phone
          )
        )
      `
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteError || !quote) {
    console.error(
      "[ensureInvoiceForQuote] Failed to load quote for invoice",
      quoteId,
      quoteError?.message
    );
    return null;
  }

  const customer = firstCustomer(quote.jobs);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  const invoicePayload = {
    quote_id: quote.id,
    user_id: quote.user_id,
    workspace_id: quote.workspace_id,
    status: markPaid || quote.status === "paid" ? "paid" : "draft",
    total: Number(quote.total ?? 0),
    subtotal: Number(quote.subtotal ?? 0),
    tax: Number(quote.tax ?? 0),
    line_items: (quote.line_items as QuoteLineItem[] | null) ?? [],
    job_id: quote.job_id ?? null,
    issued_at: now,
    due_at: dueDate.toISOString(),
    paid_at: markPaid ? paidAt ?? now : quote.paid_at,
    customer_name: customer?.name ?? null,
    customer_email: customer?.email ?? null,
    stripe_payment_intent_id: paymentIntentId ?? null,
    stripe_payment_link_url: quote.stripe_payment_link_url ?? null,
    created_at: now,
    updated_at: now,
  };

  const { data: newInvoice, error: insertError } = await supabase
    .from("invoices")
    .insert(invoicePayload)
    .select("*")
    .maybeSingle();

  if (insertError) {
    console.error(
      "[ensureInvoiceForQuote] Failed to create invoice",
      quoteId,
      insertError.message
    );
    return null;
  }

  await logAuditEvent({
    supabase,
    workspaceId: quote.workspace_id ?? "",
    actorUserId: quote.user_id,
    action: "invoice_created",
    entityType: "invoice",
    entityId: newInvoice?.id ?? null,
    metadata: { quote_id: quote.id, total: invoicePayload.total, status: invoicePayload.status },
  });

  if (invoicePayload.status === "paid") {
    await logAuditEvent({
      supabase,
      workspaceId: quote.workspace_id ?? "",
      actorUserId: quote.user_id,
      action: "invoice_paid",
      entityType: "invoice",
      entityId: newInvoice?.id ?? null,
      metadata: { quote_id: quote.id, payment_intent: paymentIntentId, paid_at: invoicePayload.paid_at },
    });
  }

  return newInvoice;
}
