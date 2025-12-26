export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { formatCurrency } from "@/utils/timeline/formatters";
import { publicInvoiceUrl } from "@/utils/urls/public";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import CopyInvoicePublicLinkButton from "@/app/(app)/invoices/[id]/CopyInvoicePublicLinkButton";
import {
  calculateDaysSinceDate,
  computeFollowupDueInfo,
  deriveInvoiceFollowupRecommendation,
  getInvoiceFollowupBaseDate,
  getInvoiceSentDate,
} from "@/lib/domain/communications/followupRecommendations";
import {
  findLatestFollowupMessage,
  type FollowupMessageRef,
} from "@/lib/domain/communications/followupMessages";
import { createInvoiceFollowupMessageAction } from "@/app/(app)/invoices/invoiceFollowupActions";

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
  invoice_public_token: string | null;
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

function formatFollowupChannel(value: string | null | undefined) {
  if (!value) return "Message";
  const lowercase = value.toLowerCase();
  if (lowercase === "sms") return "SMS";
  if (lowercase === "email") return "Email";
  if (lowercase === "phone") return "Phone";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRelativeFollowupDate(value: string | null | undefined, now: Date) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = now.getTime() - parsed.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) {
    return "today";
  }
  if (diffDays === 1) {
    return "1 day ago";
  }
  return `${diffDays} days ago`;
}

export default async function InvoiceDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const shellClass = "hb-shell pt-20 pb-8 space-y-6";

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[invoice-detail] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  const workspaceResult = await getCurrentWorkspace({
    supabase,
    allowAutoCreateWorkspace: false,
  });

  if (workspaceResult.reason === "unauthenticated") {
    redirect("/login");
  }

  if (!workspaceResult.workspace) {
    return (
      <div className={shellClass}>
        <HbCard className="space-y-3">
          <h1 className="hb-heading-1 text-2xl font-semibold">Access denied</h1>
          <p className="hb-muted text-sm">You don’t have access to this workspace’s invoices.</p>
        </HbCard>
      </div>
    );
  }

  const workspace = workspaceResult.workspace;

  // Avoid redirects here to keep the server render deterministic and hydration-safe.
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
          invoice_public_token,
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
      <div className={shellClass}>
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

  const rawJob = Array.isArray(invoice.job) ? invoice.job[0] ?? null : invoice.job ?? null;
  const jobId = rawJob?.id ?? null;
  const quoteId = invoice.quote?.id ?? null;

  let followupMessages: FollowupMessageRef[] = [];
  try {
    const matchClauses = [
      `invoice_id.eq.${invoice.id}`,
      quoteId ? `quote_id.eq.${quoteId}` : null,
      jobId ? `job_id.eq.${jobId}` : null,
    ].filter(Boolean) as string[];

    if (matchClauses.length > 0) {
      let messageQuery = supabase
        .from<FollowupMessageRef>("messages")
        .select("id, job_id, quote_id, invoice_id, channel, via, created_at")
        .eq("workspace_id", workspace.id)
        .in("channel", ["sms", "email", "phone"])
        .order("created_at", { ascending: false })
        .limit(20);

      if (matchClauses.length === 1) {
        const [clause] = matchClauses;
        const [column, value] = clause.split(".eq.");
        if (column && value) {
          messageQuery = messageQuery.eq(column, value);
        }
      } else {
        messageQuery = messageQuery.or(matchClauses.join(","));
      }

      const { data: followupRows, error: followupError } = await messageQuery;
      if (followupError) {
        console.error("[invoice-detail] Failed to load follow-up messages:", followupError);
      } else {
        followupMessages = followupRows ?? [];
      }
    }
  } catch (error) {
    console.error("[invoice-detail] Follow-up message query failed:", error);
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
  const jobCustomer =
    rawJob?.customers && Array.isArray(rawJob.customers)
      ? rawJob.customers[0] ?? null
      : rawJob?.customers ?? null;
  const customerName = jobCustomer?.name ?? invoice.customer_name ?? "Customer TBD";
  const customerId = jobCustomer?.id ?? rawJob?.customer_id ?? null;
  const jobHref = rawJob?.id ? `/jobs/${rawJob.id}` : null;
  const customerHref = customerId ? `/customers/${customerId}` : null;
  const quoteHref = invoice.quote?.id ? `/quotes/${invoice.quote.id}` : null;
  const publicUrl = invoice.invoice_public_token ? publicInvoiceUrl(invoice.invoice_public_token) : null;

  const invoiceSentDate = getInvoiceSentDate({
    issuedAt: invoice.issued_at,
    createdAt: invoice.created_at,
  });
  const daysSinceInvoiceSent = calculateDaysSinceDate(invoiceSentDate);
  const followupMetadata = {
    invoiceId: invoice.id,
    jobId,
    customerId,
  };
  const followupRecommendation = deriveInvoiceFollowupRecommendation({
    outcome: invoice.status ?? "invoice_sent",
    daysSinceInvoiceSent,
    status: invoice.status,
    metadata: followupMetadata,
  });
  const followupBaseDate = getInvoiceFollowupBaseDate({
    dueAt: invoice.due_at,
    issuedAt: invoice.issued_at,
    createdAt: invoice.created_at,
  });
  const followupDueInfo = computeFollowupDueInfo({
    quoteCreatedAt: followupBaseDate,
    callCreatedAt: null,
    invoiceDueAt: invoice.due_at ?? null,
    recommendedDelayDays: followupRecommendation.recommendedDelayDays,
  });
  if (process.env.NODE_ENV !== "production") {
    console.log("[invoice-followup-reco]", {
      ...followupMetadata,
      recommendation: followupRecommendation,
      dueInfo: followupDueInfo,
    });
  }
  const lastFollowupMessage = findLatestFollowupMessage({
    messages: followupMessages,
    invoiceId: invoice.id,
    jobId,
    quoteId,
    recommendedChannel: followupRecommendation.recommendedChannel,
  });
  const renderNow = new Date();
  const lastFollowupChannel = formatFollowupChannel(lastFollowupMessage?.channel);
  const lastFollowupRelative = formatRelativeFollowupDate(lastFollowupMessage?.created_at, renderNow);
  const relativeLabel = lastFollowupRelative
    ? `${lastFollowupRelative.charAt(0).toUpperCase()}${lastFollowupRelative.slice(1)}`
    : "Recently";
  const followupExists = Boolean(lastFollowupMessage);
  const lastFollowupSummary = followupExists
    ? `Follow-up created ${relativeLabel} via ${lastFollowupChannel}`
    : "No follow-up message recorded yet.";
  const lastFollowupHref = lastFollowupMessage ? `/messages/${lastFollowupMessage.id}` : null;
  const channelLabel =
    followupRecommendation.recommendedChannel === "sms" ? "SMS" : "Email";
  const followupButtonLabel = followupExists
    ? "Create another follow-up message"
    : "Prepare follow-up message";
  const followupButtonVariant = followupExists ? "ghost" : "secondary";
  const workspaceLabel = workspace.name ?? "Workspace";
  // TODO: read the workspace brand name from settings once it’s available in this scope.
  const followupHelperText = !followupExists
    ? `${workspaceLabel} will create a message draft in Messages via ${channelLabel} using this invoice context.`
    : null;
  if (process.env.NODE_ENV !== "production") {
    console.log("[invoice-followup-status]", {
      invoiceId: invoice.id,
      hasFollowup: Boolean(lastFollowupMessage),
      followupMessageId: lastFollowupMessage?.id ?? null,
    });
  }
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
  const now = renderNow;
  const dueDate = invoice.due_at ? new Date(invoice.due_at) : null;
  const msPerDay = 1000 * 60 * 60 * 24;
  const rawDaysDiff = dueDate ? (dueDate.getTime() - now.getTime()) / msPerDay : null;
  const daysUntilDue = rawDaysDiff != null ? Math.ceil(rawDaysDiff) : null;
  const isPaid = statusKey === "paid";
  let timingLabel = "Due date TBD";
  if (isPaid) {
    timingLabel = paidLabel !== "—" ? `Paid on ${paidLabel}` : "Marked as paid";
  } else if (daysUntilDue != null) {
    if (daysUntilDue > 1) {
      timingLabel = `Due in ${daysUntilDue} days`;
    } else if (daysUntilDue === 1) {
      timingLabel = "Due tomorrow";
    } else if (daysUntilDue === 0) {
      timingLabel = "Due today";
    } else {
      const overdueDays = Math.abs(daysUntilDue);
      timingLabel = `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}`;
    }
  }
  const isOverdueUnpaid = Boolean(dueDate && dueDate.getTime() < now.getTime() && !isPaid);

  return (
    <div className={shellClass}>
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Invoice details</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Invoice {invoiceLabel}</h1>
          <p className="hb-muted text-sm">Review charges before sending or collecting payment.</p>
          <p className="text-xs text-slate-400">
            Review the balance and due date here, and send a follow-up if payment is still outstanding.
          </p>
        </div>
        <HbButton as="a" href="/invoices" size="sm" variant="ghost">
          Back to invoices
        </HbButton>
      </header>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">At a glance</span>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] ${statusMeta.className}`}
            >
              {statusMeta.label}
            </span>
            <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] font-semibold text-slate-200">
              Total: {totalLabel}
            </span>
            <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] font-semibold text-slate-200">
              Due: {dueLabel}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">{timingLabel}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span>{lastFollowupSummary}</span>
            {lastFollowupHref && (
              <Link
                href={lastFollowupHref}
                className="text-amber-400 underline-offset-2 hover:underline"
              >
                View message
              </Link>
            )}
          </div>
        </div>
        {isOverdueUnpaid && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <p className="font-semibold text-rose-100">This invoice is overdue.</p>
            <p className="text-xs text-rose-100/70">
              Consider following up so it doesn’t slip through the cracks. Use the follow-up action below to prepare a reminder.
            </p>
          </div>
        )}
        <HbCard className="space-y-5">
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
              <div className="flex flex-wrap items-center gap-3">
                <Link href={publicUrl} className="text-sm font-semibold text-sky-300 hover:text-sky-200">
                  Open public invoice
                </Link>
                <CopyInvoicePublicLinkButton url={publicUrl} />
              </div>
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
                <input type="hidden" name="invoiceId" value={invoice.id} />
                {jobId && <input type="hidden" name="jobId" value={jobId} />}
                {customerId && <input type="hidden" name="customerId" value={customerId} />}
                <input type="hidden" name="workspaceId" value={workspace.id} />
                <HbButton type="submit" size="sm" variant={followupButtonVariant}>
                  {followupButtonLabel}
                </HbButton>
                {followupHelperText && (
                  <p className="text-[11px] text-slate-400">{followupHelperText}</p>
                )}
              </form>
            </div>
          )}
        </HbCard>
      </div>
    </div>
  );
}
