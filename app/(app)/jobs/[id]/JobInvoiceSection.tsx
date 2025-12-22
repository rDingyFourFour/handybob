"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import { formatCurrency } from "@/utils/timeline/formatters";
import { createInvoiceFromAppliedQuoteAction } from "@/app/(app)/invoices/actions/createInvoiceFromAppliedQuoteAction";

type InvoiceSnapshotRow = {
  id: string;
  quote_id: string | null;
  created_at: string | null;
  total_cents: number | null;
  tax_total_cents: number | null;
  labor_total_cents: number | null;
  materials_total_cents: number | null;
  trip_fee_cents: number | null;
  currency: string | null;
};

type InvoiceActionState = {
  success: boolean;
  code: string;
  invoiceId?: string | null;
  jobId: string | null;
  quoteId?: string | null;
  totalCents?: number | null;
} | null;

type Props = {
  workspaceId: string;
  jobId: string;
  appliedQuoteId: string | null;
  invoice: InvoiceSnapshotRow | null;
  invoiceCreatedLabel: string | null;
};

const ERROR_COPY: Record<string, string> = {
  already_exists: "An invoice already exists for this job.",
  missing_applied_quote: "Apply a quote before creating an invoice.",
  unauthorized: "You no longer have access to create invoices here.",
  unknown: "We couldn’t create the invoice. Please try again.",
};

function formatCents(value: number | null | undefined) {
  if (value == null) return "—";
  return formatCurrency(value / 100);
}

export default function JobInvoiceSection({
  workspaceId,
  jobId,
  appliedQuoteId,
  invoice,
  invoiceCreatedLabel,
}: Props) {
  const router = useRouter();
  const [actionState, formAction, isSubmitting] = useActionState<InvoiceActionState, FormData>(
    createInvoiceFromAppliedQuoteAction,
    null,
  );

  const hasInvoice = Boolean(invoice?.id);
  const hasAppliedQuote = Boolean(appliedQuoteId);

  useEffect(() => {
    console.log("[invoice-job-section-visible]", { jobId, hasAppliedQuote, hasInvoice });
  }, [jobId, hasAppliedQuote, hasInvoice]);

  useEffect(() => {
    if (!actionState) return;
    if (actionState.success || actionState.code === "already_exists") {
      router.refresh();
    }
  }, [actionState, router]);

  const errorMessage =
    actionState && !actionState.success ? ERROR_COPY[actionState.code] ?? ERROR_COPY.unknown : null;

  return (
    <HbCard className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Invoice</p>
          <h2 className="hb-heading-3 text-xl font-semibold">Job invoice snapshot</h2>
        </div>
        {hasInvoice && invoice?.id ? (
          <HbButton as="a" href={`/invoices/${invoice.id}`} size="sm" variant="secondary">
            View invoice
          </HbButton>
        ) : null}
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      {!hasAppliedQuote ? (
        <p className="text-sm text-slate-400">Apply a quote to generate an invoice.</p>
      ) : null}

      {hasAppliedQuote && !hasInvoice ? (
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="jobId" value={jobId} />
          <HbButton type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? "Creating invoice..." : "Create invoice"}
          </HbButton>
        </form>
      ) : null}

      {hasInvoice ? (
        <div className="space-y-2 text-sm text-slate-200">
          <p className="font-semibold text-emerald-200">Invoice created</p>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total</p>
              <p className="text-lg font-semibold">{formatCents(invoice?.total_cents)}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Created</p>
              <p className="text-sm text-slate-200">{invoiceCreatedLabel ?? "—"}</p>
            </div>
          </div>
        </div>
      ) : null}
    </HbCard>
  );
}
