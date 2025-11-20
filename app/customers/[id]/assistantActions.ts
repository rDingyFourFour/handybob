"use server";

import { requestAssistantReply } from "@/utils/ai/assistant";
import { createServerClient } from "@/utils/supabase/server";

type CustomerAssistantState = {
  summary?: string;
  follow_up_message?: string;
  next_actions?: string[];
  error?: string;
};

type CustomerRow = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
};

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

const MAX_HISTORY_ITEMS = 60;

export async function runCustomerAssistant(
  _prev: CustomerAssistantState | null,
  formData: FormData,
): Promise<CustomerAssistantState> {
  const customerId = formData.get("customer_id");
  if (typeof customerId !== "string") {
    return { error: "Customer ID is required." };
  }

  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You must be signed in." };

    const { data: customer } = await supabase
      .from("customers")
      .select("id, user_id, name, email, phone, created_at")
      .eq("id", customerId)
      .eq("user_id", user.id)
      .single();

    if (!customer) return { error: "Customer not found." };

    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, title, status, urgency, created_at")
      .eq("customer_id", customer.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const jobList = (jobs ?? []) as JobRow[];
    const jobIds = jobList.map((job) => job.id);

    const [messagesRes, callsRes, appointmentsRes, quotesRes, invoicesRes] = await Promise.all([
      supabase
        .from("messages")
        .select("job_id, direction, subject, body, status, sent_at, created_at")
        .eq("customer_id", customer.id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("calls")
        .select("job_id, direction, status, started_at, duration_seconds, summary, ai_summary, transcript")
        .eq("customer_id", customer.id)
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(120),
      jobIds.length
        ? supabase
            .from("appointments")
            .select("job_id, title, start_time, status, location")
            .in("job_id", jobIds)
            .eq("user_id", user.id)
            .order("start_time", { ascending: false })
            .limit(120)
        : { data: [], error: null },
      jobIds.length
        ? supabase
            .from("quotes")
            .select("id, job_id, status, total, created_at, updated_at, accepted_at, paid_at")
            .in("job_id", jobIds)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(50)
        : { data: [], error: null },
      jobIds.length
        ? supabase
            .from("invoices")
            .select("id, job_id, invoice_number, status, total, created_at, issued_at, paid_at")
            .in("job_id", jobIds)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(50)
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
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      payments = (paymentRows ?? []) as PaymentRow[];
    }

    const jobNameLookup = new Map<string, string | null>();
    jobList.forEach((job) => jobNameLookup.set(job.id, job.title));

    const historyLines = buildCustomerHistory({
      customer,
      jobNameLookup,
      messages: (messagesRes.data ?? []) as MessageRow[],
      calls: (callsRes.data ?? []) as CallRow[],
      appointments: (appointmentsRes.data ?? []) as AppointmentRow[],
      quotes,
      invoices: (invoicesRes.data ?? []) as InvoiceRow[],
      payments,
    });

    const prompt = buildCustomerPrompt(customer, jobList, historyLines);
    const reply = await requestAssistantReply(prompt);

    return reply;
  } catch (error) {
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Unexpected error while contacting the assistant." };
  }
}

function buildCustomerHistory({
  customer,
  jobNameLookup,
  messages,
  calls,
  appointments,
  quotes,
  invoices,
  payments,
}: {
  customer: CustomerRow;
  jobNameLookup: Map<string, string | null>;
  messages: MessageRow[];
  calls: CallRow[];
  appointments: AppointmentRow[];
  quotes: QuoteRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
}) {
  const lines: { timestamp?: string | null; text: string }[] = [];

  lines.push({
    timestamp: customer.created_at,
    text: `Customer created with contact ${customer.email ?? "no email"} / ${customer.phone ?? "no phone"}.`,
  });

  messages.forEach((msg) =>
    lines.push({
      timestamp: msg.sent_at || msg.created_at,
      text: `Message (${msg.direction ?? "direction unknown"} · ${msg.status ?? "status unknown"})${formatJob(msg.job_id, jobNameLookup)}: ${snippet(
        msg.body || msg.subject,
      )}`,
    }),
  );

  calls.forEach((call) =>
    lines.push({
      timestamp: call.started_at,
      text: `Call (${call.direction ?? "direction unknown"} · ${call.status ?? "status unknown"})${formatJob(
        call.job_id,
        jobNameLookup,
      )}: ${snippet(call.ai_summary || call.summary || call.transcript)} Duration ${Number(call.duration_seconds ?? 0)}s.`,
    }),
  );

  appointments.forEach((appt) =>
    lines.push({
      timestamp: appt.start_time,
      text: `Appointment ${appt.status ?? "status unknown"}${formatJob(appt.job_id, jobNameLookup)}: ${appt.title ?? "Untitled"}${appt.location ? ` at ${appt.location}` : ""}.`,
    }),
  );

  quotes.forEach((quote) => {
    lines.push({
      timestamp: quote.created_at,
      text: `Quote ${quote.status ?? "status unknown"}${formatJob(quote.job_id, jobNameLookup)} total $${Number(
        quote.total ?? 0,
      ).toFixed(2)}.`,
    });
    if (quote.status === "sent" && quote.updated_at) {
      lines.push({
        timestamp: quote.updated_at,
        text: `Quote sent${formatJob(quote.job_id, jobNameLookup)} total $${Number(quote.total ?? 0).toFixed(2)}.`,
      });
    }
    if (quote.accepted_at) {
      lines.push({
        timestamp: quote.accepted_at,
        text: `Quote accepted${formatJob(quote.job_id, jobNameLookup)} total $${Number(quote.total ?? 0).toFixed(2)}.`,
      });
    }
    if (quote.paid_at) {
      lines.push({
        timestamp: quote.paid_at,
        text: `Quote paid${formatJob(quote.job_id, jobNameLookup)} total $${Number(quote.total ?? 0).toFixed(2)}.`,
      });
    }
  });

  invoices.forEach((invoice) => {
    lines.push({
      timestamp: invoice.created_at ?? invoice.issued_at,
      text: `Invoice ${invoice.status ?? "status unknown"}${formatJob(invoice.job_id, jobNameLookup)} amount $${Number(
        invoice.total ?? 0,
      ).toFixed(2)} (#${invoice.invoice_number ?? "un-numbered"}).`,
    });
    if (invoice.paid_at) {
      lines.push({
        timestamp: invoice.paid_at,
        text: `Invoice paid${formatJob(invoice.job_id, jobNameLookup)} amount $${Number(invoice.total ?? 0).toFixed(
          2,
        )}.`,
      });
    }
  });

  payments.forEach((payment) =>
    lines.push({
      timestamp: payment.created_at,
      text: `Payment received for quote ${payment.quote_id.slice(0, 8)} ${formatJob(
        findJobIdForQuote(payment.quote_id, quotes),
        jobNameLookup,
      )}: $${Number(payment.amount ?? 0).toFixed(2)} ${payment.currency?.toUpperCase() ?? "USD"}.`,
    }),
  );

  return lines
    .sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, MAX_HISTORY_ITEMS)
    .map((line) => line.text);
}

function buildCustomerPrompt(customer: CustomerRow, jobs: JobRow[], history: string[]) {
  const jobList =
    jobs.length === 0
      ? "- No jobs yet for this customer."
      : jobs
          .map(
            (job) =>
              `- ${job.title ?? "Untitled job"} (status: ${job.status ?? "unknown"}, urgency: ${job.urgency ?? "not set"}, created: ${job.created_at ?? "unknown"})`,
          )
          .join("\n");

  const historyText = history.length ? history.map((line) => `- ${line}`).join("\n") : "- No history yet.";

  return `
You are HandyBob's customer copilot for field service pros.
Stay strictly within the provided customer and related jobs. Never mention or assume anything about other customers or jobs.
Summarize briefly, propose a customer-ready follow_up_message, and list 3 actionable next_actions.

Return JSON matching:
{
  "summary": "concise recap of current situation (2 sentences max)",
  "follow_up_message": "short message to send to the customer or note if follow-up is not needed",
  "next_actions": ["action 1", "action 2", "action 3"]
}

Customer:
- Name: ${customer.name ?? "Unknown"}
- Email: ${customer.email ?? "Unknown"}
- Phone: ${customer.phone ?? "Unknown"}

Jobs for this customer:
${jobList}

Recent history across this customer (newest first):
${historyText}
`.trim();
}

function snippet(text?: string | null, max = 180) {
  if (!text) return "No content";
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function formatJob(jobId: string | null, lookup: Map<string, string | null>) {
  if (!jobId) return "";
  const title = lookup.get(jobId);
  return title ? ` [Job: ${title}]` : ` [Job: ${jobId.slice(0, 8)}]`;
}

function findJobIdForQuote(quoteId: string, quotes: QuoteRow[]) {
  const match = quotes.find((quote) => quote.id === quoteId);
  return match?.job_id ?? null;
}
