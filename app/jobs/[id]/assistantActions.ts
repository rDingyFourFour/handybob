"use server";

import { requestAssistantReply } from "@/utils/ai/assistant";
import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/utils/workspaces";
import { snippet } from "@/utils/timeline/formatters";

type JobAssistantState = {
  summary?: string;
  follow_up_message?: string;
  next_actions?: string[];
  error?: string;
};

type JobRow = {
  id: string;
  user_id: string;
  title: string | null;
  description_raw: string | null;
  category: string | null;
  urgency: string | null;
  status: string | null;
  customer_id: string | null;
  created_at: string | null;
  customers?:
    | {
        name: string | null;
        email: string | null;
        phone: string | null;
      }
    | {
        name: string | null;
        email: string | null;
        phone: string | null;
      }[]
    | null;
};

type MessageRow = {
  direction: string | null;
  subject: string | null;
  body: string | null;
  status: string | null;
  sent_at: string | null;
  created_at: string | null;
};

type CallRow = {
  direction: string | null;
  status: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  ai_summary?: string | null;
  transcript?: string | null;
};

type AppointmentRow = {
  title: string | null;
  start_time: string | null;
  status: string | null;
  location: string | null;
};

type QuoteRow = {
  id: string;
  status: string | null;
  total: number | null;
  created_at: string | null;
  updated_at: string | null;
  accepted_at: string | null;
  paid_at: string | null;
};

type InvoiceRow = {
  invoice_number: number | null;
  status: string | null;
  total: number | null;
  created_at: string | null;
  issued_at: string | null;
  paid_at: string | null;
};

type PaymentRow = {
  amount: number;
  currency: string | null;
  created_at: string;
  quote_id: string;
};

const MAX_HISTORY_ITEMS = 45;

export async function runJobAssistant(
  _prev: JobAssistantState | null,
  formData: FormData,
): Promise<JobAssistantState> {
  const jobId = formData.get("job_id");
  if (typeof jobId !== "string") {
    return { error: "Job ID is required." };
  }

  try {
    const supabase = await createServerClient();
    const { workspace } = await getCurrentWorkspace({ supabase });

    const { data: job } = await supabase
      .from("jobs")
      .select(
        "id, user_id, workspace_id, title, description_raw, category, urgency, status, customer_id, created_at, customers(name, email, phone)",
      )
      .eq("id", jobId)
      .eq("workspace_id", workspace.id)
      .single();

    if (!job) return { error: "Job not found." };
    const jobCustomer = normalizeCustomer(job.customers);
    const safeJob: JobRow = { ...job, customers: jobCustomer };

    const [messagesRes, callsRes, appointmentsRes, quotesRes, invoicesRes] = await Promise.all([
      supabase
        .from("messages")
        .select("direction, subject, body, status, sent_at, created_at")
        .eq("job_id", job.id)
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("calls")
        .select("direction, status, started_at, duration_seconds, summary, ai_summary, transcript")
        .eq("job_id", job.id)
        .eq("workspace_id", workspace.id)
        .order("started_at", { ascending: false })
        .limit(30),
      supabase
        .from("appointments")
        .select("title, start_time, status, location")
        .eq("job_id", job.id)
        .eq("workspace_id", workspace.id)
        .order("start_time", { ascending: false })
        .limit(30),
      supabase
        .from("quotes")
        .select("id, status, total, created_at, updated_at, accepted_at, paid_at")
        .eq("job_id", job.id)
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("invoices")
        .select("invoice_number, status, total, created_at, issued_at, paid_at")
        .eq("job_id", job.id)
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const quotes = (quotesRes.data ?? []) as QuoteRow[];
    const quoteIds = quotes.map((quote) => quote.id);

    let payments: PaymentRow[] = [];
    if (quoteIds.length) {
      const { data: paymentRows } = await supabase
        .from("quote_payments")
        .select("quote_id, amount, currency, created_at")
        .in("quote_id", quoteIds)
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false });
      payments = (paymentRows ?? []) as PaymentRow[];
    }

    const historyLines = buildJobHistory({
      job: safeJob,
      messages: (messagesRes.data ?? []) as MessageRow[],
      calls: (callsRes.data ?? []) as CallRow[],
      appointments: (appointmentsRes.data ?? []) as AppointmentRow[],
      quotes,
      invoices: (invoicesRes.data ?? []) as InvoiceRow[],
      payments,
    });

    const prompt = buildJobPrompt(safeJob, historyLines);
    const reply = await requestAssistantReply(prompt);

    return reply;
  } catch (error) {
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Unexpected error while contacting the assistant." };
  }
}

function buildJobHistory({
  job,
  messages,
  calls,
  appointments,
  quotes,
  invoices,
  payments,
}: {
  job: JobRow;
  messages: MessageRow[];
  calls: CallRow[];
  appointments: AppointmentRow[];
  quotes: QuoteRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
}) {
  const lines: { timestamp?: string | null; text: string }[] = [];

  lines.push({
    timestamp: job.created_at,
    text: `Job created with status "${job.status}" and urgency "${job.urgency ?? "not set"}".`,
  });

  messages.forEach((msg) =>
    lines.push({
      timestamp: msg.sent_at || msg.created_at,
      text: `Message (${msg.direction ?? "direction unknown"} · ${msg.status ?? "status unknown"}): ${snippet(
        msg.body || msg.subject,
        180,
        "No content",
      )}`,
    }),
  );

  calls.forEach((call) =>
    lines.push({
      timestamp: call.started_at,
      text: `Call (${call.direction ?? "direction unknown"} · ${call.status ?? "status unknown"}): ${snippet(
        call.ai_summary || call.summary || call.transcript,
        180,
        "No content",
      )} Duration ${Number(call.duration_seconds ?? 0)}s.`,
    }),
  );

  appointments.forEach((appt) =>
    lines.push({
      timestamp: appt.start_time,
      text: `Appointment ${appt.status ?? "status unknown"}: ${appt.title ?? "Untitled"}${appt.location ? ` at ${appt.location}` : ""}.`,
    }),
  );

  quotes.forEach((quote) => {
    lines.push({
      timestamp: quote.created_at,
      text: `Quote created (${quote.status ?? "status unknown"}) total $${Number(quote.total ?? 0).toFixed(2)}.`,
    });
    if (quote.status === "sent" && quote.updated_at) {
      lines.push({
        timestamp: quote.updated_at,
        text: `Quote sent total $${Number(quote.total ?? 0).toFixed(2)}.`,
      });
    }
    if (quote.accepted_at) {
      lines.push({
        timestamp: quote.accepted_at,
        text: `Quote accepted total $${Number(quote.total ?? 0).toFixed(2)}.`,
      });
    }
    if (quote.paid_at) {
      lines.push({
        timestamp: quote.paid_at,
        text: `Quote marked paid total $${Number(quote.total ?? 0).toFixed(2)}.`,
      });
    }
  });

  invoices.forEach((invoice) => {
    lines.push({
      timestamp: invoice.created_at ?? invoice.issued_at,
      text: `Invoice created (${invoice.status ?? "status unknown"}) amount $${Number(invoice.total ?? 0).toFixed(
        2,
      )}.`,
    });
    if (invoice.paid_at) {
      lines.push({
        timestamp: invoice.paid_at,
        text: `Invoice paid amount $${Number(invoice.total ?? 0).toFixed(2)}.`,
      });
    }
  });

  payments.forEach((payment) =>
    lines.push({
      timestamp: payment.created_at,
      text: `Payment received $${Number(payment.amount ?? 0).toFixed(2)} ${payment.currency?.toUpperCase() ?? "USD"}.`,
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

function buildJobPrompt(job: JobRow, history: string[]) {
  const customer = normalizeCustomer(job.customers);
  const historyText = history.length ? history.map((line) => `- ${line}`).join("\n") : "- No history yet.";

  return `
You are HandyBob's job copilot for field service pros.
Focus strictly on the single job and customer provided. Never speculate about other jobs or customers and do not use data that is not explicitly included below.
Summarize briefly, propose a short customer-ready follow_up_message, and list 3 actionable next_actions.

Return JSON matching:
{
  "summary": "concise recap of current situation (2 sentences max)",
  "follow_up_message": "short message to send to the customer or note if not needed",
  "next_actions": ["action 1", "action 2", "action 3"]
}

Job:
- Title: ${job.title ?? "Untitled job"}
- Status: ${job.status ?? "unknown"}
- Urgency: ${job.urgency ?? "not set"}
- Category: ${job.category ?? "not set"}
- Description: ${job.description_raw ?? "No description provided."}

Customer:
- Name: ${customer?.name ?? "Unknown"}
- Email: ${customer?.email ?? "Unknown"}
- Phone: ${customer?.phone ?? "Unknown"}

Recent history for this job (newest first):
${historyText}
`.trim();
}

function normalizeCustomer(
  customer:
    | {
        name: string | null;
        email: string | null;
        phone: string | null;
      }
    | {
        name: string | null;
        email: string | null;
        phone: string | null;
      }[]
    | null
    | undefined,
) {
  if (Array.isArray(customer)) return customer[0] ?? null;
  return customer ?? null;
}
