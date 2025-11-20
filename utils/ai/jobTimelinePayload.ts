"use server";

import { createServerClient } from "@/utils/supabase/server";

// Central timeline normaliser for AI prompts:
// - Used by job AI summary, next actions, and follow-up helpers.
// - Limits history size and truncates long text to keep prompts small and scoped.

/**
 * buildJobTimelinePayload
 *
 * Single source of truth for AI-facing job history payloads.
 * Given a job_id and user_id, it:
 *  - Fetches the job (owned by the user) and its customer.
 *  - Fetches quotes, invoices, appointments, messages, calls, and payments for that job
 *    using the same selection logic as the job timeline UI.
 *  - Produces a compact, prompt-ready JSON object with timestamps, event types, and short descriptions.
 *  - Strips unneeded fields and truncates long message bodies/transcripts to keep prompts small.
 *  - Applies MAX_EVENTS caps and per-field truncation to avoid prompt bloat.
 *
 * The returned object is safe to JSON.stringify and send to the OpenAI Responses API.
 */
export async function buildJobTimelinePayload(jobId: string, userId: string) {
  const supabase = createServerClient();

  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, user_id, title, description_raw, category, urgency, status, customer_id, created_at, customers(name, email, phone)"
    )
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  if (!job) {
    throw new Error("Job not found or access denied.");
  }

  const [quotesRes, appointmentsRes, messagesRes, callsRes, invoicesRes] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, status, total, created_at, updated_at, accepted_at, paid_at")
      .eq("job_id", jobId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("appointments")
      .select("title, start_time, status, location")
      .eq("job_id", jobId)
      .eq("user_id", userId)
      .order("start_time", { ascending: false }),
    supabase
      .from("messages")
      .select("direction, subject, body, status, created_at, sent_at")
      .eq("job_id", jobId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("calls")
      .select("direction, status, started_at, duration_seconds, summary, ai_summary, transcript")
      .eq("job_id", jobId)
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(100),
    supabase
      .from("invoices")
      .select("invoice_number, status, total, created_at, issued_at, paid_at")
      .eq("job_id", jobId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  const quotes = quotesRes.data ?? [];
  const quoteIds = quotes.map((q) => q.id);
  const appointments = appointmentsRes.data ?? [];
  const messages = messagesRes.data ?? [];
  const calls = callsRes.data ?? [];
  const invoices = invoicesRes.data ?? [];

  let payments: { quote_id: string; amount: number; currency: string | null; created_at: string }[] = [];
  if (quoteIds.length) {
    const { data: paymentRows } = await supabase
      .from("quote_payments")
      .select("quote_id, amount, currency, created_at")
      .in("quote_id", quoteIds)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    payments = paymentRows ?? [];
  }

  const events: TimelineEvent[] = [];

  events.push({
    type: "job_created",
    timestamp: job.created_at,
    title: "Job created",
    detail: truncate(job.description_raw, 240),
    status: job.status,
  });

  messages.forEach((msg) =>
    events.push({
      type: "message",
      timestamp: msg.sent_at || msg.created_at,
      title: `${msg.direction === "inbound" ? "Inbound" : "Outbound"} message`,
      detail: truncate(msg.body || msg.subject, 320),
      status: msg.status,
    })
  );

  calls.forEach((call) =>
    events.push({
      type: "call",
      timestamp: call.started_at,
      title: `${call.direction === "inbound" ? "Inbound" : "Outbound"} call`,
      detail: `Summary: ${truncate(call.ai_summary || call.summary, 200)} Transcript: ${truncate(call.transcript, 200)}`,
      status: call.status,
    })
  );

  appointments.forEach((appt) =>
    events.push({
      type: "appointment",
      timestamp: appt.start_time,
      title: "Appointment",
      detail: [appt.title, appt.location ? `Location: ${appt.location}` : null]
        .filter(Boolean)
        .join(" · "),
      status: appt.status,
    })
  );

  quotes.forEach((quote) => {
    events.push({
      type: "quote",
      timestamp: quote.created_at,
      title: "Quote created",
      detail: `Total $${Number(quote.total ?? 0).toFixed(2)}`,
      status: quote.status,
    });
    if (quote.status === "sent" && quote.updated_at) {
      events.push({
        type: "quote",
        timestamp: quote.updated_at,
        title: "Quote sent",
        detail: `Total $${Number(quote.total ?? 0).toFixed(2)}`,
        status: "sent",
      });
    }
    if (quote.accepted_at) {
      events.push({
        type: "quote",
        timestamp: quote.accepted_at,
        title: "Quote accepted",
        detail: `Total $${Number(quote.total ?? 0).toFixed(2)}`,
        status: "accepted",
      });
    }
    if (quote.paid_at) {
      events.push({
        type: "quote",
        timestamp: quote.paid_at,
        title: "Quote paid",
        detail: `Total $${Number(quote.total ?? 0).toFixed(2)}`,
        status: "paid",
      });
    }
  });

  invoices.forEach((invoice) => {
    events.push({
      type: "invoice",
      timestamp: invoice.created_at ?? invoice.issued_at,
      title: "Invoice created",
      detail: `Invoice #${invoice.invoice_number ?? "un-numbered"} · $${Number(invoice.total ?? 0).toFixed(2)}`,
      status: invoice.status,
    });
    if (invoice.paid_at) {
      events.push({
        type: "invoice",
        timestamp: invoice.paid_at,
        title: "Invoice paid",
        detail: `Invoice #${invoice.invoice_number ?? "un-numbered"} · $${Number(invoice.total ?? 0).toFixed(2)}`,
        status: "paid",
      });
    }
  });

  payments.forEach((payment) =>
    events.push({
      type: "payment",
      timestamp: payment.created_at,
      title: "Payment received",
      detail: `$${Number(payment.amount ?? 0).toFixed(2)} ${payment.currency?.toUpperCase() ?? "USD"}`,
    })
  );

  const normalized: JobTimelinePayload = {
    job: {
      title: job.title,
      description: truncate(job.description_raw, 400),
      category: job.category,
      urgency: job.urgency,
      status: job.status,
      created_at: job.created_at,
    },
    customer: {
      name: job.customers?.name,
      email: job.customers?.email,
      phone: job.customers?.phone,
    },
    events: events
      .sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 150), // cap number of events to keep payload small
  };

  return normalized;
}

type TimelineEvent = {
  type:
    | "job_created"
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
};

export type JobTimelinePayload = {
  job: {
    title: string | null;
    description: string | null;
    category: string | null;
    urgency: string | null;
    status: string | null;
    created_at: string | null;
  };
  customer: {
    name: string | null | undefined;
    email: string | null | undefined;
    phone: string | null | undefined;
  };
  events: TimelineEvent[];
};

function truncate(value: unknown, max = 300) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}
