"use server";

// Attention domain helpers: run under RLS via createServerClient but require callers to pass a workspace_id so queries stay scoped.
// Entry points: `getAttentionItems(workspaceId)` and `getAttentionCutoffs(now)` keep dashboard cutoffs centralized.

import { buildLog } from "@/utils/buildLog";
import { formatCurrency } from "@/utils/timeline/formatters";
import { formatFriendlyDateTime, formatRelativeMinutesAgo, daysSince } from "@/utils/dashboard/time";
import { formatLeadSourceLabel } from "@/utils/dashboard/leads";
import { normalizeCustomer } from "@/utils/dashboard/customers";
import { createServerClient } from "@/utils/supabase/server";
import { aiUrgencyRank } from "@/utils/dashboard/urgency";

buildLog("lib/domain/attention loaded");

const ATTENTION_WINDOWS = {
  NEW_LEAD_DAYS: 7,
  QUOTE_STALE_DAYS: 3,
  INVOICE_OVERDUE_GRACE_DAYS: 0,
};

export type AttentionWindowCutoffs = {
  newLeadWindowStart: Date;
  staleQuoteCutoff: Date;
  overdueInvoiceCutoff: Date;
};

export async function getAttentionCutoffs(now = new Date()): Promise<AttentionWindowCutoffs> {
  return {
    newLeadWindowStart: newLeadCutoff(now),
    staleQuoteCutoff: staleQuoteCutoff(now),
    overdueInvoiceCutoff: overdueInvoiceCutoff(now),
  };
}

export type AttentionCategoryKey =
  | "new_leads"
  | "stale_quotes"
  | "overdue_invoices"
  | "unprocessed_calls";

export type AttentionAction = {
  label: string;
  href: string;
  variant?: "ghost" | "solid";
};

export type AttentionListRowData = {
  id: string;
  primary: string;
  secondary?: string | null;
  tag?: string | null;
  amount?: string;
  meta?: string;
  actions?: AttentionAction[];
  dismissType?: "lead" | "quote" | "invoice" | "call";
  href: string;
};

export type AttentionItemsResult = {
  leads: AttentionListRowData[];
  quotes: AttentionListRowData[];
  invoices: AttentionListRowData[];
  calls: AttentionListRowData[];
  urgentEmergencyCount: number;
  leadSourceCounts: {
    web: number;
    calls: number;
    manual: number;
    other: number;
  };
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const newLeadCutoff = (now: Date) => addDays(now, -ATTENTION_WINDOWS.NEW_LEAD_DAYS);
const staleQuoteCutoff = (now: Date) => addDays(now, -ATTENTION_WINDOWS.QUOTE_STALE_DAYS);
const overdueInvoiceCutoff = (now: Date) =>
  addDays(now, -ATTENTION_WINDOWS.INVOICE_OVERDUE_GRACE_DAYS);

type GetAttentionOptions = {
  leadLimit?: number;
  quoteLimit?: number;
  invoiceLimit?: number;
  callLimit?: number;
  workspaceTimeZone?: string | null;
};

type LeadRow = {
  id: string;
  title: string | null;
  urgency: string | null;
  source: string | null;
  ai_urgency: string | null;
  attention_reason: string | null;
  created_at: string | null;
  customer: { name: string | null } | { name: string | null }[] | null;
};

type QuoteRow = {
  id: string;
  status: string | null;
  total: number | null;
  created_at: string | null;
  job_id: string | null;
  job:
    | {
        title: string | null;
        customers:
          | { name: string | null }
          | { name: string | null }[]
          | null;
      }
    | null;
};

type InvoiceRow = {
  id: string;
  status: string | null;
  total: number | null;
  due_at: string | null;
  job_id: string | null;
  job:
    | {
        title: string | null;
        customers:
          | { name: string | null }
          | { name: string | null }[]
          | null;
      }
    | null;
};

type CallRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  from_number: string | null;
  priority: string | null;
  needs_followup: boolean | null;
  attention_reason: string | null;
  ai_urgency: string | null;
  job_id: string | null;
  jobs: { id: string; title: string | null } | { id: string; title: string | null }[] | null;
  customers: { id: string | null; name: string | null } | { id: string | null; name: string | null }[] | null;
};

export async function getAttentionItems(
  workspaceId: string,
  options: GetAttentionOptions = {}
): Promise<AttentionItemsResult> {
  const {
    leadLimit = 3,
    quoteLimit = 3,
    invoiceLimit = 3,
    callLimit = 3,
    workspaceTimeZone,
  } = options;

  const supabase = await createServerClient();
  const now = new Date();
  const leadsWindow = newLeadCutoff(now);
  const quoteThreshold = staleQuoteCutoff(now);
  const invoiceThreshold = overdueInvoiceCutoff(now);

  const [leadsRes, quotesRes, invoicesRes, callsRes] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        `
          id,
          title,
          urgency,
          source,
          ai_urgency,
          attention_reason,
          created_at,
          customer:customers ( name )
        `
      )
      .eq("workspace_id", workspaceId)
      .eq("status", "lead")
      .gte("created_at", leadsWindow.toISOString())
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("quotes")
      .select(
        `
          id,
          status,
          total,
          created_at,
          job_id,
          job:jobs (
            title,
            customers ( name )
          )
        `
      )
      .eq("workspace_id", workspaceId)
      .eq("status", "sent")
      .lt("created_at", quoteThreshold.toISOString())
      .order("created_at", { ascending: true })
      .limit(10),
    supabase
      .from("invoices")
      .select(
        `
          id,
          status,
          total,
          due_at,
          job_id,
          job:jobs (
            title,
            customers ( name )
          )
        `
      )
      .eq("workspace_id", workspaceId)
      .in("status", ["sent", "overdue"])
      .lt("due_at", invoiceThreshold.toISOString())
      .order("due_at", { ascending: true })
      .limit(10),
    supabase
      .from("calls")
      .select(
        `
          id,
          status,
          created_at,
          from_number,
          priority,
          needs_followup,
          attention_reason,
          ai_urgency,
          job_id,
          jobs ( id, title ),
          customers ( id, name )
        `
      )
      .eq("workspace_id", workspaceId)
      .or("transcript.is.null,ai_summary.is.null,job_id.is.null,needs_followup.eq.true")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const leads = formatLeadRows((leadsRes.data ?? []) as LeadRow[], leadLimit);
  const quotes = formatQuoteRows((quotesRes.data ?? []) as QuoteRow[], quoteLimit);
  const invoices = formatInvoiceRows((invoicesRes.data ?? []) as InvoiceRow[], invoiceLimit);
  const calls = formatCallRows((callsRes.data ?? []) as CallRow[], callLimit, workspaceTimeZone);

  const leadRows = (leadsRes.data ?? []) as LeadRow[];

  const leadSourceCounts = leadRows.reduce(
    (acc, lead) => {
      const source = (lead.source || "other").toLowerCase();
      if (source === "web_form") acc.web++;
      else if (source === "voicemail") acc.calls++;
      else if (source === "manual") acc.manual++;
      else acc.other++;
      return acc;
    },
    { web: 0, calls: 0, manual: 0, other: 0 }
  ) ?? { web: 0, calls: 0, manual: 0, other: 0 };

  const urgentEmergencyCount = leadRows.filter((lead) =>
    (lead.ai_urgency || lead.urgency || "").toLowerCase() === "emergency"
  ).length;

  return {
    leads,
    quotes,
    invoices,
    calls,
    urgentEmergencyCount,
    leadSourceCounts,
  };
}

function formatLeadRows(rows: LeadRow[], limit: number) {
  const sorted = rows.sort(
    (a, b) =>
      aiUrgencyRank(a.ai_urgency || a.urgency) - aiUrgencyRank(b.ai_urgency || b.urgency)
  );
  return sorted.slice(0, limit).map<AttentionListRowData>((lead) => {
    const customer = normalizeCustomer(lead.customer);
    const leadName = customer?.name || "Unknown customer";
    const sourceLabel = formatLeadSourceLabel(lead.source);
    const leadAge = daysSince(lead.created_at);
    return {
      id: lead.id,
      primary: lead.title || "Lead",
      secondary: `Caller: ${leadName} • ${sourceLabel}`,
      meta: `Lead opened ${leadAge ?? "—"} day${leadAge === 1 ? "" : "s"} ago`,
      tag: (lead.ai_urgency || lead.urgency)?.toLowerCase() || "lead",
      actions: [{ label: "Follow up", href: `/jobs/${lead.id}`, variant: "ghost" }],
      dismissType: "lead",
      href: `/jobs/${lead.id}`,
    };
  });
}

function formatQuoteRows(rows: QuoteRow[], limit: number) {
  return rows.slice(0, limit).map<AttentionListRowData>((quote) => {
    const job = Array.isArray(quote.job) ? quote.job[0] ?? null : quote.job ?? null;
    const customers = normalizeCustomer(job?.customers);
    const jobTitle = job?.title || "job";
    const recipient = customers?.name || jobTitle;
    const quoteAge = daysSince(quote.created_at);
    return {
      id: quote.id,
      primary: jobTitle,
      amount: formatCurrency(quote.total ?? 0),
      meta: `Sent ${quoteAge ?? "—"} day${quoteAge === 1 ? "" : "s"} ago`,
      secondary: `Quote for ${recipient}`,
      tag: quote.status || "sent",
      actions: [
        { label: "Send reminder", href: `/quotes/${quote.id}`, variant: "ghost" },
        { label: "Follow up", href: `/quotes/${quote.id}?action=follow-up`, variant: "ghost" },
      ],
      dismissType: "quote",
      href: `/quotes/${quote.id}`,
    };
  });
}

function formatInvoiceRows(rows: InvoiceRow[], limit: number) {
  return rows.slice(0, limit).map<AttentionListRowData>((inv) => {
    const job = Array.isArray(inv.job) ? inv.job[0] ?? null : inv.job ?? null;
    const customers = normalizeCustomer(job?.customers);
    const jobTitle = job?.title || "invoice";
    const recipient = customers?.name || jobTitle;
    const overdueDays = daysSince(inv.due_at);
    return {
      id: inv.id,
      primary: jobTitle,
      amount: formatCurrency(inv.total ?? 0),
      meta: `${overdueDays ?? 0} day${overdueDays === 1 ? "" : "s"} overdue`,
      secondary: `Invoice to ${recipient}`,
      tag: inv.status || "overdue",
      actions: [
        { label: "Open invoice", href: `/invoices/${inv.id}`, variant: "ghost" },
        { label: "Mark paid", href: `/invoices/${inv.id}?action=mark-paid`, variant: "solid" },
      ],
      dismissType: "invoice",
      href: `/invoices/${inv.id}`,
    };
  });
}

function formatCallRows(rows: CallRow[], limit: number, timeZone?: string | null) {
  return rows.slice(0, limit).map<AttentionListRowData>((call) => {
    const friendly = formatFriendlyDateTime(call.created_at, null, timeZone ?? undefined);
    const relative = formatRelativeMinutesAgo(call.created_at);
    return {
      id: call.id,
      primary: call.from_number || "Unknown number",
      secondary: friendly,
      meta: relative,
      tag: (call.ai_urgency || call.priority || "follow-up").toLowerCase(),
      actions: [
        { label: "Review call", href: `/calls/${call.id}`, variant: "ghost" },
        { label: "Transcribe call", href: `/calls/${call.id}?action=transcribe`, variant: "ghost" },
      ],
      dismissType: "call",
      href: `/calls/${call.id}`,
    };
  });
}
