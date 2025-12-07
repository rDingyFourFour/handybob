export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { formatCurrency } from "@/utils/timeline/formatters";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import {
  calculateDaysSinceDate,
  computeFollowupDueInfo,
  deriveInvoiceFollowupRecommendation,
  getInvoiceFollowupBaseDate,
  getInvoiceSentDate,
  type FollowupDueInfo,
  type InvoiceFollowupRecommendation,
} from "@/lib/domain/communications/followupRecommendations";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import {
  AttentionInvoiceRow,
  isInvoiceAgingUnpaidForAttention,
  isInvoiceOverdueForAttention,
} from "@/lib/domain/dashboard/attention";

type InvoiceRow = {
  id: string;
  invoice_number: number | null;
  user_id: string;
  job_id: string | null;
  status: string | null;
  total: number | null;
  issued_at: string | null;
  due_at: string | null;
  created_at: string | null;
  customer_name: string | null;
  customer_email: string | null;
  job?: {
    id: string | null;
    title: string | null;
    customer_id: string | null;
    customers?: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
  } | null;
};

const STATUS_CLASSES: Record<string, string> = {
  draft: "border border-slate-700 bg-slate-900/40 text-slate-200",
  sent: "border border-amber-500/40 bg-amber-500/10 text-amber-200",
  overdue: "border border-rose-500/40 bg-rose-500/10 text-rose-200",
  paid: "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
};

function getStatusLabel(status: string | null) {
  if (!status) return "Draft";
  if (status.toLowerCase() === "paid") return "Paid";
  if (status.toLowerCase() === "overdue") return "Overdue";
  if (status.toLowerCase() === "sent") return "Sent";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

type StatusFilterKey = "all" | "unpaid" | "overdue";

const STATUS_FILTERS: Array<{ key: StatusFilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "unpaid", label: "Unpaid" },
  { key: "overdue", label: "Overdue" },
];

const BOOLEAN_TRUE_VALUES = new Set(["1", "true"]);
function parseBooleanFlag(raw?: string | string[] | undefined) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    return false;
  }
  return BOOLEAN_TRUE_VALUES.has(value.toLowerCase());
}

function buildStatusHref(filter: StatusFilterKey) {
  const params = new URLSearchParams();
  if (filter !== "all") {
    params.set("status", filter);
  }
  const query = params.toString();
  return query ? `/invoices?${query}` : "/invoices";
}

function resolveStatusFilter(raw?: string | string[] | undefined): StatusFilterKey {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "unpaid" || value === "overdue") {
    return value;
  }
  return "all";
}

function isPaidOrVoidedStatus(statusKey: string) {
  return statusKey === "paid" || statusKey === "void" || statusKey === "voided";
}

type FollowupViewMode = "all" | "queue";

function buildFollowupsHref(mode: FollowupViewMode, statusFilter: StatusFilterKey) {
  const params = new URLSearchParams();
  if (statusFilter !== "all") {
    params.set("status", statusFilter);
  }
  if (mode === "queue") {
    params.set("followups", "queue");
  }
  const query = params.toString();
  return query ? `/invoices?${query}` : "/invoices";
}

function getSearchParamValue(raw?: string | string[] | undefined): string | undefined {
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}


export default async function InvoicesPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await searchParamsPromise;
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[invoices] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  let user;
  let workspace;
  try {
    const workspaceContext = await getCurrentWorkspace({ supabase });
    user = workspaceContext.user;
    workspace = workspaceContext.workspace;
  } catch (error) {
    console.error("[invoices] Failed to resolve workspace:", error);
    redirect("/");
  }

  if (!user) {
    redirect("/");
  }
  if (!workspace) {
    redirect("/");
  }

  const statusFilterKey = resolveStatusFilter(searchParams?.status);
  const followupsFilter = getSearchParamValue(searchParams?.followups);
  const overdueParam = getSearchParamValue(searchParams?.overdue);
  const isOverdueAttentionView = parseBooleanFlag(overdueParam);
  const agingParam = getSearchParamValue(searchParams?.aging);
  const isAgingAttentionView = parseBooleanFlag(agingParam);
  const agingFilterEnabled = isAgingAttentionView;
  const followupsQueueActive = followupsFilter === "queue";
  const followupsQueueHref = buildFollowupsHref("queue", statusFilterKey);
  const followupsAllHref = buildFollowupsHref("all", statusFilterKey);
  const agingActiveHref = buildStatusHref("unpaid");
  const agingInactiveHref = "/invoices?status=unpaid&aging=1";
  const agingChipHref = agingFilterEnabled ? agingActiveHref : agingInactiveHref;

  let invoices: InvoiceRow[] = [];
  let invoicesError: unknown = null;

  try {
    let query = supabase
      .from("invoices")
      .select(
        `
          id,
          invoice_number,
          user_id,
          job_id,
          status,
          total,
          issued_at,
          due_at,
          created_at,
          customer_name,
          customer_email,
          job:jobs (
            id,
            title,
            customer_id,
            customers (
              id,
              name
            )
          )
        `
      )
      .eq("user_id", user.id)
      .order("issued_at", { ascending: false, nulls: "last" })
      .limit(100);

    if (statusFilterKey === "overdue") {
      query = query.eq("status", "overdue");
    } else if (statusFilterKey === "unpaid") {
      query = query.not("status", "eq", "paid");
    }

    const { data, error } = await query;
    if (error) {
      console.error("[invoices] Failed to load invoices:", error);
      invoicesError = error;
    } else {
      invoices = (data ?? []) as InvoiceRow[];
    }
  } catch (error) {
    console.error("[invoices] Failed to load invoices:", error);
    invoicesError = error;
  }

  function formatDate(value: string | null) {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  const shortId = (value: string) => value.slice(0, 8);
  const followupChipClass = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition ${
      active
        ? "bg-slate-50 text-slate-950 shadow-sm shadow-slate-900/40"
        : "text-slate-400 hover:text-slate-100"
    }`;

  const now = new Date();

  type EnrichedInvoiceRow = {
    invoice: InvoiceRow;
    invoiceLabel: string;
    customerName: string;
    jobTitle: string;
    amountLabel: string;
    issuedLabel: string;
    dueLabel: string;
    statusKey: string;
    statusLabel: string;
    statusClass: string;
    highlightClass: string;
    followupRecommendation: InvoiceFollowupRecommendation;
    followupDueInfo: FollowupDueInfo;
  };

  const enrichedInvoices: EnrichedInvoiceRow[] = invoices.map((invoice) => {
    const jobCustomer =
      invoice.job?.customers && Array.isArray(invoice.job.customers)
        ? invoice.job.customers[0] ?? null
        : invoice.job?.customers ?? null;
    const customerName = jobCustomer?.name ?? invoice.customer_name ?? "Customer TBD";
    const jobId = invoice.job?.id ?? null;
    const jobTitle = invoice.job?.title ?? "Job TBD";
    const metadataCustomerId = jobCustomer?.id ?? invoice.job?.customer_id ?? null;
    const invoiceLabel = invoice.invoice_number
      ? `#${invoice.invoice_number}`
      : `Inv ${shortId(invoice.id)}`;
    const amountLabel =
      invoice.total != null ? formatCurrency(invoice.total) : "—";
    const statusKey = invoice.status?.toLowerCase() ?? "draft";
    const statusLabel = getStatusLabel(invoice.status);
    const statusClass = STATUS_CLASSES[statusKey] ?? STATUS_CLASSES.draft;
    const issuedLabel = formatDate(invoice.issued_at);
    const dueLabel = formatDate(invoice.due_at);
    const highlightClass =
      statusKey === "overdue"
        ? "border-rose-500/60 bg-slate-900/80 ring-1 ring-rose-500/30"
        : "";
    const daysSinceInvoiceSent = calculateDaysSinceDate(
      getInvoiceSentDate({
        issuedAt: invoice.issued_at,
        createdAt: invoice.created_at,
      }),
    );
    const followupRecommendation = deriveInvoiceFollowupRecommendation({
      outcome: invoice.status ?? "invoice_sent",
      daysSinceInvoiceSent,
      status: invoice.status,
      metadata: {
        invoiceId: invoice.id,
        jobId,
        customerId: metadataCustomerId,
      },
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
      now,
    });
    if (process.env.NODE_ENV !== "production") {
      console.log("[invoice-followup-due]", {
        invoiceId: invoice.id,
        status: statusKey,
        baseDate: followupBaseDate,
        recommendedDelayDays: followupRecommendation.recommendedDelayDays,
        dueStatus: followupDueInfo.dueStatus,
        dueLabel: followupDueInfo.dueLabel,
      });
    }
    return {
      invoice,
      invoiceLabel,
      customerName,
      jobTitle,
      amountLabel,
      issuedLabel,
      dueLabel,
      statusKey,
      statusLabel,
      statusClass,
      highlightClass,
      followupRecommendation,
      followupDueInfo,
    };
  });

  const collectionsQueueInvoices = enrichedInvoices.filter((row) => {
    const overdueStatus = row.followupDueInfo.dueStatus === "overdue";
    return !isPaidOrVoidedStatus(row.statusKey) && overdueStatus;
  });

  const toAttentionInvoiceRow = (row: EnrichedInvoiceRow): AttentionInvoiceRow => ({
    id: row.invoice.id,
    status: row.invoice.status,
    created_at: row.invoice.created_at,
    due_date: row.invoice.due_at,
  });
  const shouldApplyAgingAttentionView = isAgingAttentionView && !isOverdueAttentionView;
  let invoicesToDisplay = followupsQueueActive ? collectionsQueueInvoices : enrichedInvoices;
  if (isOverdueAttentionView) {
    invoicesToDisplay = invoicesToDisplay.filter((row) =>
      isInvoiceOverdueForAttention(toAttentionInvoiceRow(row), now)
    );
  } else if (shouldApplyAgingAttentionView) {
    invoicesToDisplay = invoicesToDisplay.filter((row) =>
      isInvoiceAgingUnpaidForAttention(toAttentionInvoiceRow(row), now)
    );
  }
  console.log("[invoices-attention-view]", {
    workspaceId: workspace.id,
    statusFilterKey,
    isOverdueAttentionView,
    isAgingAttentionView,
    visibleCount: invoicesToDisplay.length,
    visibleIdsSample: invoicesToDisplay.slice(0, 5).map((row) => row.invoice.id),
  });
  const visibleCountLabel =
    invoicesToDisplay.length === 1 ? "invoice" : "invoices";
  const totalCount = enrichedInvoices.length;
  const unpaidInvoiceRows = enrichedInvoices.filter((row) => row.statusKey !== "paid");
  const unpaidCount = unpaidInvoiceRows.length;
  const overdueCount = enrichedInvoices.filter((row) => row.statusKey === "overdue").length;
  const hasInvoices = totalCount > 0;
  const resetFiltersHref = buildFollowupsHref("all", "all");
  const attentionViewActive = isOverdueAttentionView || isAgingAttentionView;
  const attentionViewEmpty = attentionViewActive && invoicesToDisplay.length === 0;
  const attentionViewHelperText = isOverdueAttentionView
    ? "Showing overdue unpaid invoices that need attention."
    : "Showing older unpaid invoices that may need a nudge.";
  const clearAttentionFilterHref = buildStatusHref("unpaid");
  if (statusFilterKey === "unpaid") {
    console.log("[invoices-dashboard-source]", {
      statusFilter: statusFilterKey,
      unpaidCount,
      unpaidIds: unpaidInvoiceRows.slice(0, 5).map((row) => row.invoice.id),
    });
  }

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Invoices</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Invoices</h1>
          <p className="hb-muted text-sm">See what’s billed, due, and ready to collect.</p>
          {totalCount > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-400">
              <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">At a glance</span>
              <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] font-semibold text-slate-200">
                Total invoices: {totalCount}
              </span>
              <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] font-semibold text-slate-200">
                Unpaid: {unpaidCount}
              </span>
              <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-[11px] font-semibold text-slate-200">
                Overdue: {overdueCount}
              </span>
            </div>
          )}
          {attentionViewActive && (
            <p className="mt-2 text-sm text-slate-400">{attentionViewHelperText}</p>
          )}
        </div>
        <HbButton as={Link} href="/invoices/new" size="sm" variant="secondary">
          New invoice
        </HbButton>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((filter) => {
          const isActive = filter.key === statusFilterKey;
          return (
            <Link
              key={filter.key}
              href={buildStatusHref(filter.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                isActive
                  ? "bg-slate-50 text-slate-950 shadow-sm shadow-slate-900/40"
                  : "text-slate-400 hover:text-slate-100"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={followupsAllHref}
          className={followupChipClass(!followupsQueueActive)}
        >
          All invoices
        </Link>
        <Link
          href={followupsQueueHref}
          className={followupChipClass(followupsQueueActive)}
        >
          Follow-up queue
        </Link>
        {statusFilterKey === "unpaid" && (
          <Link
            href={agingChipHref}
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition ${
              agingFilterEnabled
                ? "bg-slate-50 text-slate-950 shadow-sm shadow-slate-900/40"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            Aging
          </Link>
        )}
      </div>
      {followupsQueueActive && (
        <p className="text-sm font-semibold text-emerald-200">
          Showing {collectionsQueueInvoices.length.toLocaleString()} invoices needing collections follow-up.
        </p>
      )}

      {invoicesError ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">Something went wrong</h2>
          <p className="hb-muted text-sm">We couldn’t load this page. Try again or go back.</p>
        </HbCard>
      ) : attentionViewEmpty ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">
            {isOverdueAttentionView ? "No overdue invoices right now" : "No aging unpaid invoices"}
          </h2>
          <p className="hb-muted text-sm">
            {isOverdueAttentionView
              ? "No overdue invoices right now. You can clear the attention filter to see all unpaid invoices."
              : "No aging unpaid invoices right now. You can clear the attention filter to see all unpaid invoices."}
          </p>
          <div className="flex flex-wrap gap-2">
            <HbButton as={Link} href={clearAttentionFilterHref}>
              Clear filter
            </HbButton>
          </div>
        </HbCard>
      ) : invoicesToDisplay.length === 0 ? (
        followupsQueueActive ? (
          <HbCard className="space-y-3">
            <h2 className="hb-card-heading text-lg font-semibold">Collections queue is empty</h2>
            <p className="hb-muted text-sm">
              There are no unpaid overdue invoices needing attention right now. Once something is overdue, it will appear here.
            </p>
            <div className="flex flex-wrap gap-2">
              <HbButton as={Link} href={resetFiltersHref}>
                View all invoices
              </HbButton>
            </div>
          </HbCard>
        ) : !hasInvoices ? (
          <HbCard className="space-y-3">
            <h2 className="hb-card-heading text-lg font-semibold">No invoices yet</h2>
            <p className="hb-muted text-sm">
              Create your first invoice from an accepted quote or directly from a job to start tracking payments.
            </p>
            <div className="flex flex-wrap gap-2">
              <HbButton as={Link} href="/invoices/new">
                New invoice
              </HbButton>
              <Link
                href="/jobs"
                className="text-xs uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-100"
              >
                View jobs
              </Link>
            </div>
          </HbCard>
        ) : (
          <HbCard className="space-y-3">
            <h2 className="hb-card-heading text-lg font-semibold">No invoices match your current filters</h2>
            <p className="hb-muted text-sm">
              Try switching to “All” or clearing follow-up filters so every invoice in your workspace is visible.
            </p>
            <div className="flex flex-wrap gap-2">
              <HbButton as={Link} href={resetFiltersHref}>
                Show all invoices
              </HbButton>
              <Link
                href={buildStatusHref("all")}
                className="text-xs uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-100"
              >
                Reset status filters
              </Link>
            </div>
          </HbCard>
        )
      ) : (
        <HbCard className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="hb-card-heading text-lg font-semibold">All invoices</h2>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Showing {invoicesToDisplay.length} {visibleCountLabel}, newest issued first
              </p>
            </div>
          </div>

          <div className="grid gap-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr]">
            <span>Invoice #</span>
            <span>Customer</span>
            <span>Job</span>
            <span className="text-right">Amount</span>
            <span>Status</span>
            <span>Due date</span>
          </div>

          <div className="space-y-2">
            {invoicesToDisplay.map((row) => {
              const {
                invoice,
                invoiceLabel,
                customerName,
                jobTitle,
                amountLabel,
                statusLabel,
                statusClass,
                highlightClass,
                dueLabel,
                issuedLabel,
                followupRecommendation,
                followupDueInfo,
              } = row;
              const needsCollectionsFollowUp =
                !isPaidOrVoidedStatus(row.statusKey) && followupDueInfo.dueStatus === "overdue";
              const collectionsPillLabel = followupsQueueActive ? "Collections queue" : "Needs follow-up";
              const collectionsPillClass = followupsQueueActive
                ? "border border-amber-500/40 bg-amber-500/10 text-amber-200"
                : "border border-slate-700/40 bg-slate-950/60 text-slate-300";
              const showDuePill =
                !followupRecommendation.shouldSkipFollowup &&
                followupDueInfo.dueStatus !== "none";
              const duePillClass =
                followupDueInfo.dueStatus === "overdue"
                  ? "border border-rose-500/40 bg-rose-500/10 text-rose-200"
                  : followupDueInfo.dueStatus === "due-today"
                  ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "border border-slate-800/60 bg-slate-900/80 text-slate-300";

              return (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  className={`group grid gap-3 rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-3 transition hover:border-slate-600 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr] ${highlightClass}`}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{invoiceLabel}</p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Issued {issuedLabel}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{customerName}</p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Customer</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{jobTitle}</p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Job</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-100">{amountLabel}</p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Amount</p>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] ${statusClass}`}>
                        {statusLabel}
                      </span>
                      {followupRecommendation.shouldSkipFollowup ? (
                        <span className="inline-flex items-center rounded-full border border-slate-700/40 px-2 py-0.5 text-[11px] uppercase tracking-[0.3em] text-slate-400">
                          No follow-up needed
                        </span>
                      ) : null}
                      {showDuePill && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.3em] ${duePillClass}`}
                        >
                          {followupDueInfo.dueLabel}
                        </span>
                      )}
                      {needsCollectionsFollowUp && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.3em] ${collectionsPillClass}`}
                        >
                          {collectionsPillLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{dueLabel}</p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Due date</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </HbCard>
      )}
    </div>
  );
}
