"use server";

import { createServerClient } from "@/utils/supabase/server";

// Customer-level timeline normaliser for AI prompts:
// - Used by customer AI summary and check-in helpers.
// - Caps history size and truncates long text to avoid prompt bloat and cross-customer leakage.

type JobRow = {
  id: string;
  title: string | null;
  status: string | null;
  urgency: string | null;
  created_at: string | null;
};

type MessageRow = {
  job_id: string | null;
  direction: string | null;
  subject: string | null;
  body: string | null;
  status: string | null;
  sent_at: string | null;
  created_at: string | null;
};

type CallRow = {
  job_id: string | null;
  direction: string | null;
  status: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  ai_summary?: string | null;
  transcript?: string | null;
};

type AppointmentRow = {
  job_id: string | null;
  title: string | null;
  start_time: string | null;
  status: string | null;
  location: string | null;
};

type QuoteRow = {
  id: string;
  job_id: string | null;
  status: string | null;
  total: number | null;
  created_at: string | null;
  updated_at: string | null;
  accepted_at: string | null;
  paid_at: string | null;
};

type InvoiceRow = {
  id: string;
  job_id: string | null;
  invoice_number: number | null;
  status: string | null;
  total: number | null;
  created_at: string | null;
  issued_at: string | null;
  paid_at: string | null;
};

type PaymentRow = {
  quote_id: string;
  amount: number;
  currency: string | null;
  created_at: string;
};

type TimelineEvent = {
  type:
    | "customer_created"
    | "job"
    | "message"
    | "call"
    | "appointment"
    | "quote"
    | "invoice"
    | "payment";
  timestamp: string | null;
  title: string;
  detail?: string | null;
  status?: string | null;
  job_title?: string | null;
};

export type CustomerTimelinePayload = {
  customer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    created_at: string | null;
  };
  jobs: JobRow[];
  events: TimelineEvent[];
};

/**
 * buildCustomerTimelinePayload
 *
 * Centralized helper to build an AI-friendly history payload for a customer.
 * Fetches the customer, all their jobs, and related activity (messages, calls,
 * appointments, quotes, invoices, payments). Returns a compact object safe to
 * JSON.stringify for LLM prompts.
 */
export async function buildCustomerTimelinePayload(customerId: string, workspaceId: string) {
  const supabase = createServerClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, workspace_id, name, email, phone, created_at")
    .eq("id", customerId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!customer) {
    throw new Error("Customer not found or access denied.");
  }

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, status, urgency, created_at")
    .eq("customer_id", customer.id)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  const jobList = (jobs ?? []) as JobRow[];
  const jobIds = jobList.map((job) => job.id);

  const [messagesRes, callsRes, appointmentsRes, quotesRes, invoicesRes] = await Promise.all([
    supabase
      .from("messages")
      .select("job_id, direction, subject, body, status, sent_at, created_at")
      .eq("customer_id", customer.id)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("calls")
      .select("job_id, direction, status, started_at, duration_seconds, summary, ai_summary, transcript")
      .eq("customer_id", customer.id)
      .eq("workspace_id", workspaceId)
      .order("started_at", { ascending: false })
      .limit(150),
    jobIds.length
      ? supabase
          .from("appointments")
          .select("job_id, title, start_time, status, location")
          .in("job_id", jobIds)
          .eq("workspace_id", workspaceId)
          .order("start_time", { ascending: false })
          .limit(150)
      : { data: [], error: null },
    jobIds.length
      ? supabase
          .from("quotes")
          .select("id, job_id, status, total, created_at, updated_at, accepted_at, paid_at")
          .in("job_id", jobIds)
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(80)
      : { data: [], error: null },
    jobIds.length
      ? supabase
          .from("invoices")
          .select("id, job_id, invoice_number, status, total, created_at, issued_at, paid_at")
          .in("job_id", jobIds)
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(80)
      : { data: [], error: null },
  ]);

  const quotes = (quotesRes.data ?? []) as QuoteRow[];
  const quoteIds = quotes.map((quote) => quote.id);

  let payments: PaymentRow[] = [];
  if (quoteIds.length) {
    const { data: paymentRows } = await supabase
      .from("quote_payments")
      .select("quote_id, amount, currency, created_at")
      .in("quote_id", quoteIds)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    payments = (paymentRows ?? []) as PaymentRow[];
  }

  const jobNameLookup = new Map<string, string | null>();
  jobList.forEach((job) => jobNameLookup.set(job.id, job.title));

  const events: TimelineEvent[] = [
    {
      type: "customer_created",
      timestamp: customer.created_at,
      title: "Customer created",
      detail: `${customer.email || "no email"} · ${customer.phone || "no phone"}`,
    },
    ...jobList.map((job): TimelineEvent => ({
      type: "job",
      timestamp: job.created_at,
      title: `Job created: ${job.title || "Untitled job"}`,
      detail: job.status ? `Status: ${job.status}` : null,
      job_title: job.title,
    })),
  ];

  (messagesRes.data ?? []).forEach((msg: MessageRow) =>
    events.push({
      type: "message",
      timestamp: msg.sent_at || msg.created_at,
      title: `${msg.direction === "inbound" ? "Inbound" : "Outbound"} message`,
      detail: truncate(msg.body || msg.subject, 260),
      status: msg.status,
      job_title: msg.job_id ? jobNameLookup.get(msg.job_id) || null : null,
    })
  );

  (callsRes.data ?? []).forEach((call: CallRow) =>
    events.push({
      type: "call",
      timestamp: call.started_at,
      title: `${call.direction === "inbound" ? "Inbound" : "Outbound"} call`,
      detail: `Summary: ${truncate(call.ai_summary || call.summary, 160)} Transcript: ${truncate(call.transcript, 160)}`,
      status: call.status,
      job_title: call.job_id ? jobNameLookup.get(call.job_id) || null : null,
    })
  );

  (appointmentsRes.data ?? []).forEach((appt: AppointmentRow) =>
    events.push({
      type: "appointment",
      timestamp: appt.start_time,
      title: "Appointment",
      detail: [appt.title, appt.location ? `Location: ${appt.location}` : null].filter(Boolean).join(" · "),
      status: appt.status,
      job_title: appt.job_id ? jobNameLookup.get(appt.job_id) || null : null,
    })
  );

  quotes.forEach((quote) => {
    events.push({
      type: "quote",
      timestamp: quote.created_at,
      title: "Quote created",
      detail: `Total $${Number(quote.total ?? 0).toFixed(2)}`,
      status: quote.status,
      job_title: quote.job_id ? jobNameLookup.get(quote.job_id) || null : null,
    });
    if (quote.status === "sent" && quote.updated_at) {
      events.push({
        type: "quote",
        timestamp: quote.updated_at,
        title: "Quote sent",
        detail: `Total $${Number(quote.total ?? 0).toFixed(2)}`,
        status: "sent",
        job_title: quote.job_id ? jobNameLookup.get(quote.job_id) || null : null,
      });
    }
    if (quote.accepted_at) {
      events.push({
        type: "quote",
        timestamp: quote.accepted_at,
        title: "Quote accepted",
        detail: `Total $${Number(quote.total ?? 0).toFixed(2)}`,
        status: "accepted",
        job_title: quote.job_id ? jobNameLookup.get(quote.job_id) || null : null,
      });
    }
    if (quote.paid_at) {
      events.push({
        type: "quote",
        timestamp: quote.paid_at,
        title: "Quote paid",
        detail: `Total $${Number(quote.total ?? 0).toFixed(2)}`,
        status: "paid",
        job_title: quote.job_id ? jobNameLookup.get(quote.job_id) || null : null,
      });
    }
  });

  (invoicesRes.data ?? []).forEach((invoice: InvoiceRow) => {
    events.push({
      type: "invoice",
      timestamp: invoice.created_at ?? invoice.issued_at,
      title: "Invoice created",
      detail: `Invoice #${invoice.invoice_number ?? "un-numbered"} · $${Number(invoice.total ?? 0).toFixed(2)}`,
      status: invoice.status,
      job_title: invoice.job_id ? jobNameLookup.get(invoice.job_id) || null : null,
    });
    if (invoice.paid_at) {
      events.push({
        type: "invoice",
        timestamp: invoice.paid_at,
        title: "Invoice paid",
        detail: `Invoice #${invoice.invoice_number ?? "un-numbered"} · $${Number(invoice.total ?? 0).toFixed(2)}`,
        status: "paid",
        job_title: invoice.job_id ? jobNameLookup.get(invoice.job_id) || null : null,
      });
    }
  });

  payments.forEach((payment) =>
    events.push({
      type: "payment",
      timestamp: payment.created_at,
      title: "Payment received",
      detail: `$${Number(payment.amount ?? 0).toFixed(2)} ${payment.currency?.toUpperCase() ?? "USD"}`,
      job_title: findPaymentJobTitle(payment.quote_id, quotes, jobNameLookup),
    })
  );

  const normalized: CustomerTimelinePayload = {
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      created_at: customer.created_at,
    },
    jobs: jobList,
    events: events
      .sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 250),
  };

  return normalized;
}

function truncate(value: unknown, max = 240) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function findPaymentJobTitle(quoteId: string, quotes: QuoteRow[], lookup: Map<string, string | null>) {
  const quote = quotes.find((q) => q.id === quoteId);
  if (!quote?.job_id) return null;
  return lookup.get(quote.job_id) || null;
}
