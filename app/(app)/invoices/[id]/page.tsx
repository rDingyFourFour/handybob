export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { formatCurrency } from "@/utils/timeline/formatters";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import {
  calculateDaysSinceDate,
  computeFollowupDueInfo,
  deriveInvoiceFollowupRecommendation,
  getInvoiceFollowupBaseDate,
  getInvoiceSentDate,
} from "@/lib/domain/communications/followupRecommendations";
import { createInvoiceFollowupMessageAction } from "@/app/(app)/invoices/[id]/invoiceFollowupActions";

type CustomerLink = {
  id: string | null;
  name: string | null;
  phone?: string | null;
};

type JobLink = {
  id: string | null;
  title: string | null;
  customer_id: string | null;
  customers?: CustomerLink | CustomerLink[] | null;
};

type LineItem = {
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
};

type InvoiceDetailRow = {
  id: string;
  workspace_id: string;
  invoice_number: number | null;
  quote_id: string | null;
  status: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  public_token: string | null;
  line_items: LineItem[] | null;
  customer_name: string | null;
  customer_email: string | null;
  job?: JobLink | JobLink[] | null;
  quote?: {
    id: string;
    status: string | null;
    total: number | null;
  } | null;
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "border border-slate-700 bg-slate-900/40 text-slate-200",
  },
  sent: {
    label: "Sent",
    className: "border border-amber-500/40 bg-amber-500/10 text-amber-200",
  },
  paid: {
    label: "Paid",
    className: "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  },
  overdue: {
    label: "Overdue",
    className: "border border-rose-500/40 bg-rose-500/10 text-rose-200",
  },
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function shortId(value: string | null | undefined) {
  if (!value) return "—";
  return value.slice(0, 8);
}

export default async function InvoiceDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[invoice-detail] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  let workspace;
  try {
    const workspaceContext = await getCurrentWorkspace({ supabase });
    workspace = workspaceContext.workspace;
  } catch (error) {
    console.error("[invoice-detail] Failed to resolve workspace:", error);
    return (
      <div className="hb-shell pt-20 pb-8 space-y-6">
        <HbCard className="space-y-3">
          <h1 className="hb-heading-1 text-2xl font-semibold">Unable to load invoice</h1>
          <p className="hb-muted text-sm">We couldn’t determine your workspace. Please try again.</p>
        </HbCard>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="hb-shell pt-20 pb-8 space-y-6">
        <HbCard className="space-y-3">
          <h1 className="hb-heading-1 text-2xl font-semibold">Unable to load invoice</h1>
          <p className="hb-muted text-sm">Workspace context is missing. Please try again later.</p>
        </HbCard>
      </div>
    );
  }

  let invoice: InvoiceDetailRow | null = null;
  try {
    const { data, error } = await supabase
      .from<InvoiceDetailRow>("invoices")
      .select(
        `
          id,
          workspace_id,
          invoice_number,
          quote_id,
          status,
          subtotal,
          tax,
          total,
          issued_at,
          due_at,
          paid_at,
          public_token,
          line_items,
          customer_name,
          customer_email,
          job:jobs (
            id,
            title,
            customer_id,
            customers (
              id,
              name,
              phone
            )
          ),
          quote:quotes (
            id,
            total,
            status
          )
        `
      )
      .eq("workspace_id", workspace.id)
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      console.error("[invoice-detail] Lookup failed:", error);
    } else {
      invoice = data;
    }
  } catch (error) {
    console.error("[invoice-detail] Query failed:", error);
  }

  if (!invoice) {
    return (
      <div className="hb-shell pt-20 pb-8 space-y-6">
        <HbCard className="space-y-3">
          <h1 className="hb-heading-1 text-2xl font-semibold">Invoice not found</h1>
          <p className="hb-muted text-sm">We couldn’t find that invoice. Please go back and try again.</p>
          <HbButton as="a" href="/invoices" size="sm">
            Back to invoices
          </HbButton>
        </HbCard>
      </div>
    );
  }

  const invoiceLabel = invoice.invoice_number ? `#${invoice.invoice_number}` : `Inv ${shortId(invoice.id)}`;
  const statusKey = (invoice.status ?? "draft").toLowerCase();
  const statusMeta = STATUS_META[statusKey] ?? STATUS_META.draft;
  const totalLabel = invoice.total != null ? formatCurrency(invoice.total) : "Not set";
  const subtotalLabel = invoice.subtotal != null ? formatCurrency(invoice.subtotal) : "—";
  const taxLabel = invoice.tax != null ? formatCurrency(invoice.tax) : "—";
  const issuedLabel = formatDate(invoice.issued_at);
  const dueLabel = formatDate(invoice.due_at);
  const paidLabel = formatDate(invoice.paid_at);
  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const hasLineItems = lineItems.length > 0;
  const rawJob = Array.isArray(invoice.job) ? invoice.job[0] ?? null : invoice.job ?? null;
  const jobId = rawJob?.id ?? null;
  const jobCustomer =
    rawJob?.customers && Array.isArray(rawJob.customers)
      ? rawJob.customers[0] ?? null
      : rawJob?.customers ?? null;
  const customerName = jobCustomer?.name ?? invoice.customer_name ?? "Customer TBD";
  const customerId = jobCustomer?.id ?? rawJob?.customer_id ?? null;
  const jobHref = rawJob?.id ? `/jobs/${rawJob.id}` : null;
  const customerHref = customerId ? `/customers/${customerId}` : null;
  const quoteHref = invoice.quote?.id ? `/quotes/${invoice.quote.id}` : null;
  const publicUrl = invoice.public_token ? `/public/invoices/${invoice.public_token}` : null;
  const jobTitleForFollowup = rawJob?.title ?? invoice.job?.title ?? null;

  const invoiceSentDate = getInvoiceSentDate({
    issuedAt: invoice.issued_at,
    createdAt: invoice.created_at,
  });
  const daysSinceInvoiceSent = calculateDaysSinceDate(invoiceSentDate);
  const followupRecommendation = deriveInvoiceFollowupRecommendation({
    outcome: invoice.status ?? "invoice_sent",
    daysSinceInvoiceSent,
    status: invoice.status,
    metadata: {
      invoiceId: invoice.id,
      jobId,
      customerId,
    },
  });
  const followupBaseDate = getInvoiceFollowupBaseDate({
    dueAt: invoice.due_at,
    issuedAt: invoice.issued_at,
    createdAt: invoice.created_at,
  });
  const followupDueInfo = computeFollowupDueInfo({
    quoteCreatedAt: followupBaseDate,
    recommendation: followupRecommendation,
  });
  if (process.env.NODE_ENV !== "production") {
    console.log("[invoice-followup-reco]", {
      invoiceId: invoice.id,
      jobId,
      customerId,
      recommendation: followupRecommendation,
      dueInfo: followupDueInfo,
    });
  }
  const channelLabel =
    followupRecommendation.recommendedChannel === "sms" ? "SMS" : "Email";
  const dueLabelForTiming =
    followupDueInfo.dueStatus !== "none"
      ? followupDueInfo.dueLabel.toLowerCase()
      : null;
  const timingLine =
    !followupRecommendation.shouldSkipFollowup && followupRecommendation.recommendedTimingLabel
      ? `Timing: ${followupRecommendation.recommendedTimingLabel}${
          dueLabelForTiming ? ` (${dueLabelForTiming})` : ""
        }`
      : null;

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Invoice details</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Invoice {invoiceLabel}</h1>
          <p className="hb-muted text-sm">Review charges before sending or collecting payment.</p>
        </div>
        <HbButton as="a" href="/invoices" size="sm" variant="ghost">
          Back to invoices
        </HbButton>
      </header>

      <div className="space-y-4">
        <HbCard className="space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Status</p>
              <div className={`inline-flex items-center rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] ${statusMeta.className}`}>
                {statusMeta.label}
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-semibold text-slate-100">{totalLabel}</p>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Total amount</p>
            </div>
          </div>
          <div className="grid gap-4 text-sm text-slate-400 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Issued</p>
              <p className="text-base font-semibold text-slate-100">{issuedLabel}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Due</p>
              <p className="text-base font-semibold text-slate-100">{dueLabel}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Paid</p>
              <p className="text-base font-semibold text-slate-100">{paidLabel}</p>
            </div>
          </div>
          <div className="grid gap-4 text-sm text-slate-400 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Customer</p>
              {customerHref ? (
                <Link href={customerHref} className="text-sm font-semibold text-slate-100 hover:text-slate-50">
                  {customerName}
                </Link>
              ) : (
                <p className="text-sm font-semibold text-slate-100">{customerName}</p>
              )}
              {invoice.customer_email && (
                <p className="text-xs text-slate-500">{invoice.customer_email}</p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Job</p>
              {jobHref ? (
                <Link href={jobHref} className="text-sm font-semibold text-slate-100 hover:text-slate-50">
                  {rawJob?.title ?? shortId(rawJob?.id)}
                </Link>
              ) : (
                <p className="text-sm font-semibold text-slate-100">Job TBD</p>
              )}
            </div>
          </div>
          <div className="grid gap-2 text-sm text-slate-400 lg:grid-cols-3">
            <p>Subtotal: {subtotalLabel}</p>
            <p>Tax: {taxLabel}</p>
            {quoteHref && (
              <span>
                Quote:{" "}
                <Link href={quoteHref} className="text-slate-100 underline underline-offset-2 hover:text-slate-50">
                  {shortId(invoice.quote?.id)}
                </Link>
              </span>
            )}
          </div>
          {publicUrl && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Customer view</p>
              <Link href={publicUrl} className="text-sm font-semibold text-sky-300 hover:text-sky-200">
                Open public invoice
              </Link>
            </div>
          )}
        </HbCard>

        <HbCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Line items</p>
              <h2 className="hb-heading-3 text-xl font-semibold">What you’re charging for</h2>
            </div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              {hasLineItems ? `${lineItems.length} line item${lineItems.length === 1 ? "" : "s"}` : "Derived from quote"}
            </p>
          </div>
          {hasLineItems ? (
            <div className="space-y-2 text-sm text-slate-300">
              <div className="grid gap-4 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500 md:grid-cols-[2fr_1fr_1fr_1fr]">
                <span>Description</span>
                <span>Qty</span>
                <span>Rate</span>
                <span>Total</span>
              </div>
              <div className="space-y-2">
                {lineItems.map((item, index) => (
                  <div
                    key={`${item.description ?? "item"}-${index}`}
                    className="grid gap-4 rounded-xl border border-slate-800/60 bg-slate-950/60 px-4 py-3 text-sm text-slate-200 md:grid-cols-[2fr_1fr_1fr_1fr]"
                  >
                    <div>
                      <p className="font-semibold text-slate-100">
                        {item.description ?? `Item ${index + 1}`}
                      </p>
                    </div>
                    <div>
                      <p>{item.quantity != null ? item.quantity : "—"}</p>
                    </div>
                    <div>
                      <p>{item.unit_price != null ? formatCurrency(item.unit_price) : "—"}</p>
                    </div>
                    <div className="text-right">
                      <p>{item.total != null ? formatCurrency(item.total) : "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-300">
              <p>
                Total from{" "}
                {quoteHref ? (
                  <Link href={quoteHref} className="text-sky-300 hover:text-sky-200">
                    quote {shortId(invoice.quote?.id)}
                  </Link>
                ) : (
                  "quote"
                )}
                .
              </p>
              <p className="text-xs text-slate-500">Line items will appear here once they are synced.</p>
            </div>
          )}
        </HbCard>

        <HbCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Actions</p>
              <h2 className="hb-heading-3 text-xl font-semibold">Take the next step</h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {jobHref && (
              <HbButton as={Link} href={jobHref} size="sm" variant="secondary">
                View job
              </HbButton>
            )}
            {customerHref && (
              <HbButton as={Link} href={customerHref} size="sm" variant="ghost">
                View customer
              </HbButton>
            )}
            {rawJob?.id && (
              <HbButton
                as={Link}
                href={`/calls/new?jobId=${rawJob.id}&invoiceId=${invoice.id}`}
                size="sm"
                variant="secondary"
              >
                Follow up about this invoice
              </HbButton>
            )}
            <button
              type="button"
              disabled
              className="rounded-full border border-slate-700 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 transition"
            >
              Send invoice
            </button>
            <button
              type="button"
              disabled
              className="rounded-full border border-slate-700 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 transition"
            >
              Mark as paid
            </button>
          </div>
        </HbCard>
        <HbCard className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Follow-up</p>
            <h2 className="hb-heading-3 text-xl font-semibold">Next suggested step</h2>
          </div>
          {followupRecommendation.shouldSkipFollowup ? (
            <div className="space-y-2 text-sm text-slate-300">
              <p>No follow-up is needed for this invoice right now.</p>
              {statusKey === "paid" && (
                <p className="text-xs text-slate-500">It’s already marked as paid.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-100">
                Recommended: Send a follow-up {channelLabel.toLowerCase()} about this invoice.
              </p>
              {timingLine && <p className="text-sm text-slate-400">{timingLine}</p>}
              <form action={createInvoiceFollowupMessageAction} className="flex flex-col gap-3">
                <input type="hidden" name="invoice_id" value={invoice.id} />
                <input type="hidden" name="job_id" value={jobId ?? ""} />
                {customerId && (
                  <input type="hidden" name="customer_id" value={customerId} />
                )}
                <input type="hidden" name="workspace_id" value={workspace.id} />
                <input
                  type="hidden"
                  name="recommended_channel"
                  value={followupRecommendation.recommendedChannel}
                />
                {jobTitleForFollowup && (
                  <input type="hidden" name="job_title" value={jobTitleForFollowup} />
                )}
                <input
                  type="hidden"
                  name="invoice_number"
                  value={invoice.invoice_number != null ? invoice.invoice_number.toString() : ""}
                />
                <input
                  type="hidden"
                  name="outcome"
                  value={followupRecommendation.primaryActionLabel}
                />
                <HbButton type="submit" size="sm" variant="secondary">
                  Prepare follow-up message
                </HbButton>
              </form>
            </div>
          )}
        </HbCard>
      </div>
    </div>
  );
}
