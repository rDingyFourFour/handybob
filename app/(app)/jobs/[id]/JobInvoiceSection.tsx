"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import { formatCurrency } from "@/utils/timeline/formatters";
import { createInvoiceFromAcceptedQuoteAction } from "@/app/(app)/invoices/actions/createInvoiceFromAcceptedQuoteAction";
import { updateInvoiceStatusAction } from "@/app/(app)/invoices/actions/updateInvoiceStatusAction";
import { normalizeInvoiceStatus, type InvoiceStatus } from "@/lib/domain/invoicesLifecycle";

type InvoiceSnapshotRow = {
  id: string;
  quote_id: string | null;
  created_at: string | null;
  invoice_status: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  snapshot_total_cents: number | null;
  snapshot_tax_cents: number | null;
  snapshot_subtotal_cents: number | null;
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

type InvoiceStatusActionState = Awaited<ReturnType<typeof updateInvoiceStatusAction>> | null;

type Props = {
  workspaceId: string;
  jobId: string;
  acceptedQuoteId: string | null;
  invoice: InvoiceSnapshotRow | null;
  invoiceCreatedLabel: string | null;
};

const ERROR_COPY: Record<string, string> = {
  already_exists: "An invoice already exists for this job.",
  quote_not_accepted: "Accept the quote before creating an invoice.",
  quote_not_found: "We couldn’t find that quote. Refresh and try again.",
  job_not_found: "We couldn’t find this job. Refresh and try again.",
  forbidden: "You no longer have access to create invoices here.",
  unauthenticated: "You no longer have access to create invoices here.",
  workspace_not_found: "We couldn’t find that workspace. Please sign in again.",
  invalid_input: "We couldn’t create the invoice. Refresh and try again.",
  unknown_error: "We couldn’t create the invoice. Please try again.",
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

const STATUS_ACTION_ERROR_COPY: Record<string, string> = {
  invalid_transition: "That status change is no longer available.",
  not_found: "We couldn’t find this invoice. Refresh and try again.",
  workspace_mismatch: "This invoice belongs to a different workspace.",
  job_mismatch: "This invoice doesn’t match this job.",
  db_error: "We couldn’t update the invoice status. Try again.",
  unauthenticated: "You no longer have access to update invoices.",
  forbidden: "You no longer have access to update invoices.",
  workspace_not_found: "We couldn’t find that workspace. Please sign in again.",
  invalid_input: "We couldn’t update the invoice status with that request.",
};

function formatCents(value: number | null | undefined) {
  if (value == null) return "—";
  return formatCurrency(value / 100);
}

function formatUtcTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const iso = parsed.toISOString();
  return iso.replace("T", " ").replace(/\\.[0-9]{3}Z$/, " UTC");
}

function normalizeLifecycleStatus(value: string | null | undefined) {
  return normalizeInvoiceStatus(value) ?? "draft";
}

function buildLifecycleState(invoice: InvoiceSnapshotRow | null) {
  return {
    status: normalizeLifecycleStatus(invoice?.invoice_status ?? null),
    sentAt: invoice?.sent_at ?? null,
    paidAt: invoice?.paid_at ?? null,
    voidedAt: invoice?.voided_at ?? null,
  };
}

export default function JobInvoiceSection({
  workspaceId,
  jobId,
  acceptedQuoteId,
  invoice,
  invoiceCreatedLabel,
}: Props) {
  const router = useRouter();
  const [actionState, formAction, isSubmitting] = useActionState<InvoiceActionState, FormData>(
    createInvoiceFromAcceptedQuoteAction,
    null,
  );
  const [statusActionState, statusFormAction, statusSubmitting] = useActionState<
    InvoiceStatusActionState,
    FormData
  >(updateInvoiceStatusAction, null);
  const [lifecycleState, setLifecycleState] = useState(() => buildLifecycleState(invoice));

  const hasInvoice = Boolean(invoice?.id);
  const hasAcceptedQuote = Boolean(acceptedQuoteId);

  const statusLabel = useMemo(
    () => STATUS_LABELS[lifecycleState.status],
    [lifecycleState.status],
  );
  const sentAtLabel = useMemo(
    () => formatUtcTimestamp(lifecycleState.sentAt),
    [lifecycleState.sentAt],
  );
  const paidAtLabel = useMemo(
    () => formatUtcTimestamp(lifecycleState.paidAt),
    [lifecycleState.paidAt],
  );
  const voidedAtLabel = useMemo(
    () => formatUtcTimestamp(lifecycleState.voidedAt),
    [lifecycleState.voidedAt],
  );

  useEffect(() => {
    console.log("[job-invoice-section-visible]", { workspaceId, jobId });
  }, [workspaceId, jobId]);

  useEffect(() => {
    setLifecycleState(buildLifecycleState(invoice));
  }, [invoice]);

  useEffect(() => {
    if (!actionState) return;
    if (actionState.success || actionState.code === "already_exists") {
      router.refresh();
    }
  }, [actionState, router]);

  useEffect(() => {
    if (!statusActionState || !invoice?.id) return;
    if (statusActionState.success) {
      console.log("[invoices-status-ui-result]", {
        workspaceId,
        jobId,
        invoiceId: statusActionState.invoiceId,
        success: true,
        newStatus: statusActionState.newStatus,
      });
      setLifecycleState({
        status: statusActionState.newStatus,
        sentAt: statusActionState.sentAt,
        paidAt: statusActionState.paidAt,
        voidedAt: statusActionState.voidedAt,
      });
      return;
    }
    console.log("[invoices-status-ui-result]", {
      workspaceId,
      jobId,
      invoiceId: invoice.id,
      success: false,
      reasonCode: statusActionState.code,
    });
  }, [statusActionState, invoice, workspaceId, jobId]);

  const errorMessage =
    actionState && !actionState.success
      ? ERROR_COPY[actionState.code] ?? ERROR_COPY.unknown_error
      : null;
  const statusErrorMessage =
    statusActionState && !statusActionState.success
      ? STATUS_ACTION_ERROR_COPY[statusActionState.code] ?? STATUS_ACTION_ERROR_COPY.db_error
      : null;
  const statusSuccessMessage =
    statusActionState && statusActionState.success
      ? `Invoice marked as ${STATUS_LABELS[statusActionState.newStatus]}.`
      : null;

  const handleCreateClick = () => {
    console.log("[job-invoice-create-click]", {
      workspaceId,
      jobId,
      quoteId: acceptedQuoteId ?? null,
    });
  };

  const handleStatusSubmit = (targetStatus: InvoiceStatus) => () => {
    console.log("[invoices-status-ui-submit]", {
      workspaceId,
      jobId,
      invoiceId: invoice?.id ?? null,
      targetStatus,
    });
  };

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

      {statusErrorMessage ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-100">
          {statusErrorMessage}
        </div>
      ) : null}

      {statusSuccessMessage ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">
          {statusSuccessMessage}
        </div>
      ) : null}

      {hasAcceptedQuote ? (
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
            Accepted quote
          </span>
          <span>Quote {acceptedQuoteId?.slice(0, 8)}</span>
        </div>
      ) : null}

      {!hasAcceptedQuote && !hasInvoice ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-400">Accept a quote to create an invoice.</p>
          <HbButton type="button" size="sm" disabled>
            Create invoice from accepted quote
          </HbButton>
        </div>
      ) : null}

      {hasAcceptedQuote && !hasInvoice ? (
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="quoteId" value={acceptedQuoteId ?? ""} />
          <HbButton type="submit" size="sm" disabled={isSubmitting} onClick={handleCreateClick}>
            {isSubmitting ? "Creating invoice..." : "Create invoice from accepted quote"}
          </HbButton>
        </form>
      ) : null}

      {hasInvoice ? (
        <div className="space-y-2 text-sm text-slate-200">
          <p className="font-semibold text-emerald-200">Invoice created</p>
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
            <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-[11px] font-semibold text-slate-200">
              {statusLabel}
            </span>
            {sentAtLabel ? <span>Sent {sentAtLabel}</span> : null}
            {paidAtLabel ? <span>Paid {paidAtLabel}</span> : null}
            {voidedAtLabel ? <span>Voided {voidedAtLabel}</span> : null}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total</p>
              <p className="text-lg font-semibold">{formatCents(invoice?.snapshot_total_cents)}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Created</p>
              <p className="text-sm text-slate-200">{invoiceCreatedLabel ?? "—"}</p>
            </div>
          </div>
          {invoice?.id ? (
            <div className="flex flex-wrap items-center gap-2">
              {lifecycleState.status === "draft" ? (
                <>
                  <form
                    action={statusFormAction}
                    onSubmit={handleStatusSubmit("sent")}
                    className="flex"
                  >
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <input type="hidden" name="jobId" value={jobId} />
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <input type="hidden" name="targetStatus" value="sent" />
                    <HbButton type="submit" size="sm" disabled={statusSubmitting}>
                      {statusSubmitting ? "Updating..." : "Mark as sent"}
                    </HbButton>
                  </form>
                  <form
                    action={statusFormAction}
                    onSubmit={handleStatusSubmit("void")}
                    className="flex"
                  >
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <input type="hidden" name="jobId" value={jobId} />
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <input type="hidden" name="targetStatus" value="void" />
                    <HbButton
                      type="submit"
                      size="sm"
                      variant="secondary"
                      className="border-rose-400/50 text-rose-200 hover:border-rose-300 hover:text-rose-100"
                      disabled={statusSubmitting}
                    >
                      Void invoice
                    </HbButton>
                  </form>
                </>
              ) : null}
              {lifecycleState.status === "sent" ? (
                <>
                  <form
                    action={statusFormAction}
                    onSubmit={handleStatusSubmit("paid")}
                    className="flex"
                  >
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <input type="hidden" name="jobId" value={jobId} />
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <input type="hidden" name="targetStatus" value="paid" />
                    <HbButton type="submit" size="sm" disabled={statusSubmitting}>
                      {statusSubmitting ? "Updating..." : "Mark as paid"}
                    </HbButton>
                  </form>
                  <form
                    action={statusFormAction}
                    onSubmit={handleStatusSubmit("void")}
                    className="flex"
                  >
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <input type="hidden" name="jobId" value={jobId} />
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <input type="hidden" name="targetStatus" value="void" />
                    <HbButton
                      type="submit"
                      size="sm"
                      variant="secondary"
                      className="border-rose-400/50 text-rose-200 hover:border-rose-300 hover:text-rose-100"
                      disabled={statusSubmitting}
                    >
                      Void invoice
                    </HbButton>
                  </form>
                </>
              ) : null}
              {lifecycleState.status === "paid" ? (
                <p className="text-xs text-slate-400">Invoice is paid and cannot be changed.</p>
              ) : null}
              {lifecycleState.status === "void" ? (
                <p className="text-xs text-slate-400">Invoice is void and cannot be changed.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </HbCard>
  );
}
