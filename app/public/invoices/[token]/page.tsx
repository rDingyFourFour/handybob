// Public invoice page: uses the invoice token + admin client; exposes only customer-visible fields without auth.
import crypto from "crypto";

import { getPublicInvoiceByToken } from "@/lib/domain/invoices/publicInvoice.server";

export const dynamic = "force-dynamic";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return DATE_FORMATTER.format(parsed);
}

function formatCurrency(cents: number | null | undefined, currency: string | null | undefined) {
  if (cents == null) return "—";
  const normalizedCurrency = currency?.trim() || "USD";
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatAmount(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return "—";
  const normalizedCurrency = currency?.trim() || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function safeInvoiceReference(invoiceNumber: number | null, invoiceId: string) {
  if (invoiceNumber != null) {
    return `Invoice #${invoiceNumber}`;
  }
  const hash = crypto.createHash("sha256").update(invoiceId).digest("hex").slice(0, 8);
  return `Invoice INV-${hash.toUpperCase()}`;
}

export default async function PublicInvoicePage({
  params: paramsPromise,
}: {
  params: Promise<{ token: string }>;
}) {
  // Accept params as a promise and derive the token once.
  const { token } = await paramsPromise;
  // Server-only: resolve invoice via admin client by public token; no auth required on public link.
  const invoice = await getPublicInvoiceByToken(token);
  if (!invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-slate-950">
        <div className="hb-card max-w-xl w-full space-y-4">
          <div>
            <h1>Invoice not found</h1>
            <p className="hb-muted text-sm">
              We couldn’t locate this invoice. Please check the link or contact the sender.
            </p>
          </div>
          <p className="hb-muted text-[10px] text-center">
            Powered by HandyBob – full support office in an app.
          </p>
        </div>
      </div>
    );
  }

  const workspace = invoice.workspaces; // public-safe: only brand/phone/email/address, no internal secrets
  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const hasLineItems = lineItems.length > 0;
  const invoiceReference = safeInvoiceReference(invoice.invoice_number, invoice.id);
  const createdLabel = formatDate(invoice.created_at);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-950">
      <div className="hb-card max-w-xl w-full space-y-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Invoice</p>
          <h1>{invoiceReference}</h1>
          <p className="hb-muted text-sm">
            From: {workspace?.brand_name || workspace?.name || "HandyBob contractor"}
          </p>
          <p className="hb-muted text-sm">Created {createdLabel}</p>
        </div>

        <div className="space-y-2 rounded border border-slate-800 bg-slate-900/70 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Totals</span>
            <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              {invoice.invoice_status ? invoice.invoice_status : "draft"}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-200">
            <span>Subtotal</span>
            <span>{formatCurrency(invoice.snapshot_subtotal_cents, invoice.currency)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-200">
            <span>Tax</span>
            <span>{formatCurrency(invoice.snapshot_tax_cents, invoice.currency)}</span>
          </div>
          <div className="flex items-center justify-between text-base font-semibold text-slate-100">
            <span>Total</span>
            <span>{formatCurrency(invoice.snapshot_total_cents, invoice.currency)}</span>
          </div>
        </div>

        {hasLineItems ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Line items</p>
            <div className="space-y-2 text-sm text-slate-200">
              {lineItems.map((item, index) => (
                <div
                  key={`${item.description ?? "item"}-${index}`}
                  className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-100">
                        {item.description ?? `Item ${index + 1}`}
                      </p>
                      <p className="hb-muted text-xs">
                        Qty {item.quantity ?? "—"} · Rate{" "}
                        {item.unit_price != null
                          ? formatAmount(item.unit_price, invoice.currency)
                          : "—"}
                      </p>
                    </div>
                    <div className="text-right text-slate-100">
                      {item.total != null ? formatAmount(item.total, invoice.currency) : "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : invoice.snapshot_summary ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Summary</p>
            <p className="text-sm text-slate-200">{invoice.snapshot_summary}</p>
          </div>
        ) : null}

        <div className="rounded border border-slate-800 bg-slate-900/70 p-3 text-sm">
          <p className="font-semibold text-slate-100">Business info</p>
          <p className="hb-muted text-xs">Shared across workspace members.</p>
          <div className="mt-2 space-y-1 text-slate-200">
            <div>{workspace?.brand_name || workspace?.name || "HandyBob"}</div>
            {workspace?.brand_tagline && <div className="text-slate-400">{workspace.brand_tagline}</div>}
            {workspace?.business_email && <div className="text-slate-400">Email: {workspace.business_email}</div>}
            {workspace?.business_phone && <div className="text-slate-400">Phone: {workspace.business_phone}</div>}
            {workspace?.business_address && <div className="text-slate-400">{workspace.business_address}</div>}
          </div>
        </div>

        <p className="hb-muted text-[10px] text-center">
          Powered by HandyBob – full support office in an app.
        </p>
      </div>
    </div>
  );
}
