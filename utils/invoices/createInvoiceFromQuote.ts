// utils/invoices/createInvoiceFromQuote.ts
"use server";

import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/utils/workspaces";
import { logAuditEvent } from "@/utils/audit/log";

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

function normalizeSingle<T>(relation: T | T[] | null | undefined): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }
  return relation ?? null;
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

  const status =
    quote.status === "accepted" || quote.status === "paid" ? "sent" : "draft";

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
