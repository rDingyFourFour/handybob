import Link from "next/link";
import { redirect } from "next/navigation";

import { AiAssistantPanel } from "@/components/AiAssistantPanel";
import { CustomerCheckinHelper } from "@/components/CustomerCheckinHelper";
import { CustomerSummaryPanel } from "@/components/CustomerSummaryPanel";
import { createServerClient } from "@/utils/supabase/server";
import {
  generateCustomerCheckinDraft,
  generateCustomerSummary,
  sendCustomerCheckinMessage,
} from "./customerAiActions";
import { runCustomerAssistant } from "./assistantActions";

type Customer = {
  id: string;
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

type QuoteRow = {
  id: string;
  status: string | null;
  total: number | null;
  created_at: string | null;
  updated_at: string | null;
  accepted_at?: string | null;
  paid_at?: string | null;
  job_id: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: number | null;
  status: string | null;
  total: number | null;
  created_at: string | null;
  issued_at: string | null;
  paid_at: string | null;
  job_id: string | null;
};

type AppointmentRow = {
  id: string;
  title: string | null;
  start_time: string | null;
  status: string | null;
  location: string | null;
  job_id: string | null;
};

type MessageRow = {
  id: string;
  job_id: string | null;
  direction: string | null;
  channel: string | null;
  via: string | null;
  subject: string | null;
  body: string | null;
  status: string | null;
  created_at: string | null;
  sent_at?: string | null;
};

type CallRow = {
  id: string;
  job_id: string | null;
  direction: string | null;
  status: string | null;
  started_at: string | null;
  created_at?: string | null;
  duration_seconds: number | null;
  summary: string | null;
  ai_summary?: string | null;
  transcript?: string | null;
  recording_url?: string | null;
};

type TimelineEntry = {
  id: string;
  kind: "customer" | "job" | "message" | "call" | "appointment" | "quote" | "invoice" | "payment";
  title: string;
  detail?: string | null;
  timestamp: string | null;
  status?: string | null;
  href?: string | null;
  callSummary?: string | null;
  callTranscript?: string | null;
  recordingUrl?: string | null;
};

function formatDateTime(date: string | null) {
  if (!date) return "";
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(amount: number | null | undefined) {
  const value = Number(amount ?? 0);
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function snippet(text: string | null, max = 120) {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const customerId = params?.id;
  if (!customerId) redirect("/customers");

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .single();

  if (!customer) redirect("/customers");

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, status, urgency, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  const jobList = (jobs ?? []) as JobRow[];
  const jobIds = jobList.map((job) => job.id);
  const jobTitleMap = new Map<string, string | null>();
  jobList.forEach((job) => jobTitleMap.set(job.id, job.title));

  const [quotesRes, invoicesRes, appointmentsRes, messagesRes, callsRes] =
    await Promise.all([
      jobIds.length
        ? supabase
            .from("quotes")
            .select("id, status, total, created_at, updated_at, accepted_at, paid_at, job_id")
            .in("job_id", jobIds)
        : { data: [], error: null },
      jobIds.length
        ? supabase
            .from("invoices")
            .select("id, invoice_number, status, total, created_at, issued_at, paid_at, job_id")
            .in("job_id", jobIds)
        : { data: [], error: null },
      jobIds.length
        ? supabase
            .from("appointments")
            .select("id, title, start_time, status, location, job_id")
            .in("job_id", jobIds)
        : { data: [], error: null },
      supabase
        .from("messages")
        .select("id, job_id, direction, channel, via, subject, body, status, created_at, sent_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("calls")
        .select("id, job_id, direction, status, started_at, created_at, duration_seconds, summary, ai_summary, transcript, recording_url, from_number")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  const quotes = (quotesRes.data ?? []) as QuoteRow[];
  const invoices = (invoicesRes.data ?? []) as InvoiceRow[];
  const appointments = (appointmentsRes.data ?? []) as AppointmentRow[];
  const messages = (messagesRes.data ?? []) as MessageRow[];
  const calls = (callsRes.data ?? []) as CallRow[];

  const timeline: TimelineEntry[] = [
    {
      id: `customer-${customer.id}`,
      kind: "customer" as const,
      title: "Customer added",
      detail: customer.email || customer.phone,
      timestamp: (customer as Customer).created_at,
    },
    ...jobList.map((job): TimelineEntry => ({
      id: `job-${job.id}`,
      kind: "job" as const,
      title: `Job created: ${job.title || "Untitled job"}`,
      detail: job.status ? `Status: ${job.status}` : null,
      timestamp: job.created_at,
      href: `/jobs/${job.id}`,
    })),
    ...messages.map((message): TimelineEntry => {
      const jobTitle = message.job_id ? jobTitleMap.get(message.job_id) : null;
      return {
        id: `msg-${message.id}`,
        kind: "message" as const,
        title: `${message.direction === "inbound" ? "Inbound" : "Outbound"} message`,
        detail: [jobTitle, snippet(message.body) || snippet(message.subject)]
          .filter(Boolean)
          .join(" · "),
        timestamp: message.sent_at || message.created_at,
        status: message.status,
      };
    }),
    ...calls.map((call): TimelineEntry => {
      const jobTitle = call.job_id ? jobTitleMap.get(call.job_id) : null;
      return {
        id: `call-${call.id}`,
        kind: "call" as const,
        title: `Voicemail from ${call.from_number || customer.name || "Unknown caller"}`,
        detail: [jobTitle, snippet(call.ai_summary, 180) || snippet(call.summary, 180) || (call.transcript ? `Transcript: ${snippet(call.transcript, 140)}` : null)]
          .filter(Boolean)
          .join(" · "),
        timestamp: call.created_at || call.started_at,
        status: call.status,
        href: `/calls/${call.id}`,
        callSummary: call.ai_summary || call.summary || null,
        callTranscript: call.transcript || null,
        recordingUrl: call.recording_url || null,
      };
    }),
    ...appointments.map((appt): TimelineEntry => {
      const jobTitle = appt.job_id ? jobTitleMap.get(appt.job_id) : null;
      return {
        id: `appt-${appt.id}`,
        kind: "appointment" as const,
        title: `Appointment scheduled`,
        detail: [jobTitle, appt.title, appt.location ? `Location: ${appt.location}` : null]
          .filter(Boolean)
          .join(" · "),
        timestamp: appt.start_time,
        status: appt.status,
        href: `/appointments/${appt.id}`,
      };
    }),
    ...quotes.flatMap((quote): TimelineEntry[] => {
      const jobTitle = quote.job_id ? jobTitleMap.get(quote.job_id) : null;
      const baseDetail = [`Total ${formatCurrency(quote.total)}`, jobTitle].filter(Boolean).join(" · ");

      const events: TimelineEntry[] = [
        {
          id: `quote-${quote.id}-created`,
          kind: "quote" as const,
          title: "Quote created",
          detail: baseDetail,
          timestamp: quote.created_at,
          status: quote.status,
          href: `/quotes/${quote.id}`,
        },
      ];

      if (quote.status === "sent" && quote.updated_at && quote.updated_at !== quote.created_at) {
        events.push({
          id: `quote-${quote.id}-sent`,
          kind: "quote" as const,
          title: "Quote sent",
          detail: baseDetail,
          timestamp: quote.updated_at,
          status: "sent",
          href: `/quotes/${quote.id}`,
        });
      }

      if (quote.accepted_at) {
        events.push({
          id: `quote-${quote.id}-accepted`,
          kind: "quote" as const,
          title: "Quote accepted",
          detail: baseDetail,
          timestamp: quote.accepted_at,
          status: "accepted",
          href: `/quotes/${quote.id}`,
        });
      }

      if (quote.paid_at) {
        events.push({
          id: `quote-${quote.id}-paid`,
          kind: "quote" as const,
          title: "Quote paid",
          detail: baseDetail,
          timestamp: quote.paid_at,
          status: "paid",
          href: `/quotes/${quote.id}`,
        });
        }

        return events;
      }),
    ...invoices.flatMap((invoice): TimelineEntry[] => {
      const jobTitle = invoice.job_id ? jobTitleMap.get(invoice.job_id) : null;
      const baseDetail = [`Invoice #${invoice.invoice_number ?? invoice.id.slice(0, 8)}`, formatCurrency(invoice.total), jobTitle]
        .filter(Boolean)
        .join(" · ");

      const events: TimelineEntry[] = [
        {
          id: `invoice-${invoice.id}-created`,
          kind: "invoice" as const,
          title: "Invoice created",
          detail: baseDetail,
          timestamp: invoice.created_at ?? invoice.issued_at,
          status: invoice.status,
          href: `/invoices/${invoice.id}`,
        },
      ];

      if (invoice.paid_at) {
        events.push({
          id: `invoice-${invoice.id}-paid`,
          kind: "invoice" as const,
          title: "Invoice paid",
          detail: baseDetail,
          timestamp: invoice.paid_at,
          status: "paid",
          href: `/invoices/${invoice.id}`,
        });
      }

      return events;
    }),
  ].sort((a, b) => {
    const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="space-y-6">
      <div className="hb-card space-y-2">
        <p className="hb-label text-xs uppercase tracking-wide text-slate-400">
          Customer
        </p>
        <h1 className="text-2xl font-semibold">
          {customer.name || "Customer details"}
        </h1>
        <p className="hb-muted">
          {customer.email || "No email"} · {customer.phone || "No phone"}
        </p>
        <div className="flex gap-2 pt-2 text-xs">
          <Link href="/jobs/new" className="hb-button-ghost text-xs">
            New job
          </Link>
          <Link href="/inbox" className="hb-button-ghost text-xs">
            Open inbox
          </Link>
        </div>
      </div>

      <CustomerSummaryPanel customerId={customer.id} action={generateCustomerSummary} />

      <CustomerCheckinHelper
        customerId={customer.id}
        customerEmail={customer.email}
        customerPhone={customer.phone}
        generateAction={generateCustomerCheckinDraft}
        sendAction={sendCustomerCheckinMessage}
      />

      <AiAssistantPanel
        title="Customer brief & suggestions"
        description="Summarizes history across this customer, drafts a follow-up, and suggests next actions."
        action={runCustomerAssistant}
        fieldName="customer_id"
        fieldValue={customer.id}
      />

      <div className="hb-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Customer Timeline</h2>
            <p className="hb-muted text-sm">
              All activity and communications grouped by job.
            </p>
          </div>
        </div>

        {timeline.length === 0 ? (
          <p className="hb-muted text-sm">
            No activity yet for this customer.
          </p>
        ) : (
          <div className="space-y-3">
            {timeline.map((entry, index) => (
              <div key={entry.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-2 w-2 rounded-full bg-sky-400" />
                  {index !== timeline.length - 1 && (
                    <div className="flex-1 w-px bg-slate-800" />
                  )}
                </div>
                <div className="flex-1 border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{entry.title}</p>
                    <span className="text-xs text-slate-400">
                      {formatDateTime(entry.timestamp)}
                    </span>
                  </div>
                  {entry.detail && (
                    <p className="hb-muted text-sm mt-1">
                      {entry.detail}
                    </p>
                  )}
                  {entry.kind === "call" && (entry.callSummary || entry.callTranscript || entry.recordingUrl) && (
                    <div className="mt-2 space-y-2 text-sm text-slate-200">
                      {entry.callSummary && (
                        <div>
                          <div className="flex items-center justify-between">
                            <p className="hb-label">AI Summary</p>
                            <span className="text-[11px] text-slate-400">AI-generated · double-check key details.</span>
                          </div>
                          <p className="text-slate-200">{entry.callSummary}</p>
                        </div>
                      )}
                      {entry.callTranscript && (
                        <div>
                          <div className="flex items-center justify-between">
                            <p className="hb-label">Transcript</p>
                            <span className="text-[11px] text-slate-400">Auto-captured; verify names/addresses/times.</span>
                          </div>
                          <p className="text-slate-200 whitespace-pre-wrap">{entry.callTranscript}</p>
                        </div>
                      )}
                      {entry.recordingUrl && (
                        <div className="flex items-center gap-2 text-xs text-blue-300">
                          <audio controls src={entry.recordingUrl} className="w-full" />
                          <Link href={entry.recordingUrl} className="underline-offset-2 hover:underline">
                            Open recording
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span className="rounded-full border border-slate-800 px-2 py-1 text-[11px] uppercase tracking-wide">
                      {entry.kind}
                    </span>
                    {entry.status && <span>Status: {entry.status}</span>}
                    {entry.href && (
                      <Link
                        href={entry.href}
                        className="underline-offset-2 hover:underline"
                      >
                        Open
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
