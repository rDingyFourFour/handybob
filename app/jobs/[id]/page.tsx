import Link from "next/link";
import { redirect } from "next/navigation";

import { AiAssistantPanel } from "@/components/AiAssistantPanel";
import { JobFollowupHelper } from "@/components/JobFollowupHelper";
import { JobSummaryPanel } from "@/components/JobSummaryPanel";
import { NextActionsPanel } from "@/components/NextActionsPanel";
import { generateQuoteForJob } from "@/utils/ai/generateQuote";
import { createServerClient } from "@/utils/supabase/server";
import { generateJobSummary } from "./jobSummaryAction";
import { generateNextActions } from "./nextActionsAction";
import { generateFollowupDraft, sendFollowupMessage } from "./followupActions";
import { runJobAssistant } from "./assistantActions";
import { createSignedMediaUrl, MEDIA_BUCKET_ID } from "@/utils/supabase/storage";
import { JobMediaGallery, type MediaItem } from "./JobMediaGallery";

type QuoteRow = {
  id: string;
  status: string | null;
  total: number | null;
  created_at: string | null;
  updated_at: string | null;
  accepted_at?: string | null;
  paid_at?: string | null;
};

type AppointmentRow = {
  id: string;
  title: string | null;
  start_time: string | null;
  status: string | null;
  location: string | null;
};

type MessageRow = {
  id: string;
  customer_id?: string | null;
  channel: string | null;
  direction: string | null;
  subject: string | null;
  body: string | null;
  status: string | null;
  created_at: string | null;
  sent_at?: string | null;
};

type CallRow = {
  id: string;
  direction: string | null;
  status: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: number | null;
  status: string | null;
  total: number | null;
  created_at: string | null;
  issued_at: string | null;
  paid_at: string | null;
};

type PaymentRow = {
  id: string;
  quote_id: string;
  amount: number;
  currency: string | null;
  created_at: string;
};

type MediaRow = {
  id: string;
  bucket_id?: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  created_at: string | null;
  url?: string | null;
  caption?: string | null;
  kind?: string | null;
  quote_id?: string | null;
  invoice_id?: string | null;
  is_public?: boolean | null;
};

type TimelineEntry = {
  id: string;
  kind: "job" | "message" | "call" | "appointment" | "quote" | "invoice" | "payment";
  title: string;
  detail?: string | null;
  timestamp: string | null;
  status?: string | null;
  href?: string | null;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export default async function JobDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const jobId = params?.id;
  if (typeof jobId !== "string" || !UUID_REGEX.test(jobId)) {
    redirect("/jobs");
  }
  if (!jobId) {
    redirect("/jobs");
  }

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("*, customers(*)")
    .eq("id", jobId)
    .single();

  if (jobError) throw new Error(jobError.message);
  if (!job) redirect("/jobs");

  const [quotesRes, appointmentsRes, messagesRes, callsRes, invoicesRes] =
    await Promise.all([
      supabase
        .from("quotes")
        .select("id, status, total, created_at, updated_at, accepted_at, paid_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false }),
      supabase
        .from("appointments")
        .select("id, title, start_time, status, location")
        .eq("job_id", jobId)
        .order("start_time", { ascending: false }),
      supabase
        .from("messages")
        .select("id, customer_id, channel, direction, subject, body, status, created_at, sent_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("calls")
        .select("id, direction, status, started_at, duration_seconds, summary")
        .eq("job_id", jobId)
        .order("started_at", { ascending: false })
        .limit(50),
      supabase
        .from("invoices")
        .select("id, invoice_number, status, total, created_at, issued_at, paid_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false }),
    ]);

  const safeQuotes = (quotesRes.data ?? []) as QuoteRow[];
  const appointments = (appointmentsRes.data ?? []) as AppointmentRow[];
  const messages = (messagesRes.data ?? []) as MessageRow[];
  const calls = (callsRes.data ?? []) as CallRow[];
  const invoices = (invoicesRes.data ?? []) as InvoiceRow[];
  const quotesError = quotesRes.error;

  const quoteIds = safeQuotes.map((quote) => quote.id);
  let payments: PaymentRow[] = [];

  if (quoteIds.length) {
    const { data: paymentRows } = await supabase
      .from("quote_payments")
      .select("id, quote_id, amount, currency, created_at")
      .in("quote_id", quoteIds)
      .order("created_at", { ascending: false });
    payments = (paymentRows ?? []) as PaymentRow[];
  }

  const { data: mediaRowsRaw, error: mediaError } = await supabase
    .from("media")
    .select("id, bucket_id, storage_path, file_name, mime_type, created_at, url, caption, kind, quote_id, invoice_id, is_public")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  const mediaRows = (mediaRowsRaw ?? []) as MediaRow[];
  const mediaItems: MediaItem[] = await Promise.all(
    mediaRows.map(async (media) => {
      const bucketId = media.bucket_id || MEDIA_BUCKET_ID;
      const path = media.storage_path || "";

      if (!path) {
        return {
          id: media.id,
          file_name: media.file_name ?? "File",
          mime_type: media.mime_type ?? null,
          created_at: media.created_at ?? null,
          signed_url: null,
        };
      }

      // job-media bucket is private; serve via signed URLs
      const { signedUrl } = await createSignedMediaUrl(path, 60 * 60);

      return {
        id: media.id,
        file_name: media.file_name ?? "File",
        mime_type: media.mime_type ?? null,
        created_at: media.created_at ?? null,
        signed_url: signedUrl ?? media.url ?? null,
        caption: media.caption ?? null,
        kind: media.kind ?? null,
        quote_id: media.quote_id ?? null,
        invoice_id: media.invoice_id ?? null,
        is_public: media.is_public ?? false,
      };
    }),
  );

  const quoteOptions = safeQuotes.map((quote) => ({
    id: quote.id,
    label: `Quote ${quote.id.slice(0, 8)}${quote.status ? ` · ${quote.status}` : ""}`,
  }));

  const invoiceOptions = invoices.map((invoice) => ({
    id: invoice.id,
    label: `Invoice ${invoice.invoice_number ?? invoice.id.slice(0, 8)}${invoice.status ? ` · ${invoice.status}` : ""}`,
  }));

  const timeline: TimelineEntry[] = [
    {
      id: `job-${job.id}`,
      kind: "job" as const,
      title: "Job created",
      detail: job.description_raw || null,
      timestamp: job.created_at,
      status: job.status,
    },
    ...messages.map((message) => ({
      id: `msg-${message.id}`,
      kind: "message" as const,
      title: `${message.direction === "inbound" ? "Inbound" : "Outbound"} message`,
      detail: message.body || message.subject || null,
      timestamp: message.sent_at || message.created_at,
      status: message.status,
      href: message.customer_id
        ? `/inbox?customer_id=${message.customer_id}`
        : `/inbox`,
    })),
    ...calls.map((call) => ({
      id: `call-${call.id}`,
      kind: "call" as const,
      title: `${call.direction === "inbound" ? "Inbound" : "Outbound"} call`,
      detail: call.summary,
      timestamp: call.started_at,
      status: call.status,
    })),
    ...appointments.map((appt) => ({
      id: `appt-${appt.id}`,
      kind: "appointment" as const,
      title: `Appointment scheduled`,
      detail: appt.title ? `${appt.title}${appt.location ? ` · ${appt.location}` : ""}` : (appt.location ? `Location: ${appt.location}` : null),
      timestamp: appt.start_time,
      status: appt.status,
      href: `/appointments/${appt.id}`,
    })),
    ...safeQuotes.flatMap((quote) => {
      const events: TimelineEntry[] = [
        {
          id: `quote-${quote.id}-created`,
          kind: "quote" as const,
          title: "Quote created",
          detail: `Total ${formatCurrency(quote.total)}`,
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
          detail: `Total ${formatCurrency(quote.total)}`,
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
          detail: `Total ${formatCurrency(quote.total)}`,
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
          detail: `Total ${formatCurrency(quote.total)}`,
          timestamp: quote.paid_at,
          status: "paid",
          href: `/quotes/${quote.id}`,
        });
      }

      return events;
    }),
    ...invoices.flatMap((invoice) => {
      const events: TimelineEntry[] = [
        {
          id: `invoice-${invoice.id}-created`,
          kind: "invoice",
          title: `Invoice created`,
          detail: `Invoice #${invoice.invoice_number ?? invoice.id.slice(0, 8)} · ${formatCurrency(invoice.total)}`,
          timestamp: invoice.created_at ?? invoice.issued_at,
          status: invoice.status,
          href: `/invoices/${invoice.id}`,
        },
      ];
      if (invoice.paid_at) {
        events.push({
          id: `invoice-${invoice.id}-paid`,
          kind: "invoice",
          title: "Invoice paid",
          detail: `Invoice #${invoice.invoice_number ?? invoice.id.slice(0, 8)} · ${formatCurrency(invoice.total)}`,
          timestamp: invoice.paid_at,
          status: "paid",
          href: `/invoices/${invoice.id}`,
        });
      }
      return events;
    }),
    ...payments.map((payment) => ({
      id: `payment-${payment.id}`,
      kind: "payment" as const,
      title: "Payment received",
      detail: `${formatCurrency(payment.amount)} ${payment.currency?.toUpperCase() || "USD"}`,
      timestamp: payment.created_at,
      status: "paid",
    })),
  ].sort((a, b) => {
    const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="space-y-6">
      <div className="hb-card space-y-2">
        <p className="hb-label text-xs uppercase tracking-wide text-slate-400">
          Job
        </p>
        <h1 className="text-2xl font-semibold">
          {job.title || "Job details"}
        </h1>
        <p className="hb-muted">{job.description_raw || "No description."}</p>

        <div className="text-xs text-slate-400">
          Customer: {job.customers?.name || "Unknown"}
        </div>
        <div className="text-xs text-slate-400">Status: {job.status}</div>
        <div className="text-xs text-slate-400">
          Urgency: {job.urgency ?? "not set"}
        </div>

        {mediaItems.length > 0 && (
          <div className="pt-2 space-y-1">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Latest media</span>
              <Link href="#job-media" className="underline-offset-2 hover:underline text-blue-300">
                View all
              </Link>
            </div>
            <div className="flex gap-2 overflow-auto">
              {mediaItems
                .filter((m) => m.mime_type?.startsWith("image/"))
                .slice(0, 4)
                .map((m) => (
                  <img
                    key={m.id}
                    src={m.signed_url || ""}
                    alt={m.file_name || "Media"}
                    className="h-16 w-24 rounded-md border border-slate-800 object-cover"
                  />
                ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href={`/appointments/new?job_id=${job.id}`}
            className="hb-button-ghost text-xs"
          >
            Schedule appointment
          </Link>
          <Link href="/inbox" className="hb-button-ghost text-xs">
            Open inbox
          </Link>
        </div>
      </div>

      <JobSummaryPanel jobId={job.id} action={generateJobSummary} />

      <NextActionsPanel jobId={job.id} action={generateNextActions} />

      <JobMediaGallery
        jobId={job.id}
        items={mediaItems}
        loadError={mediaError?.message ?? null}
        quoteOptions={quoteOptions}
        invoiceOptions={invoiceOptions}
      />

      <JobFollowupHelper
        jobId={job.id}
        customerId={job.customers?.id ?? null}
        customerEmail={job.customers?.email ?? null}
        customerPhone={job.customers?.phone ?? null}
        generateAction={generateFollowupDraft}
        sendAction={sendFollowupMessage}
      />

      <AiAssistantPanel
        title="Job brief & next steps"
        description="Summarizes this job's history, drafts a customer follow-up, and suggests what to do next."
        action={runJobAssistant}
        fieldName="job_id"
        fieldValue={job.id}
      />

      <div className="hb-card space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Timeline</h2>
            <p className="hb-muted text-sm">
              Unified activity for this job and customer.
            </p>
          </div>
        </div>
        {timeline.length === 0 ? (
          <p className="hb-muted text-sm">No activity yet for this job.</p>
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
                    <p className="hb-muted text-sm mt-1">{entry.detail}</p>
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

      <div className="hb-card space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Quotes</h2>
            <p className="hb-muted text-sm">
              Generate a quote with AI or review existing drafts.
            </p>
          </div>
          <form action={generateQuoteForJob} className="flex items-center gap-2">
            <input type="hidden" name="job_id" value={job.id} />
            <button className="hb-button">
              {safeQuotes.length ? "Generate new quote" : "Generate quote with AI"}
            </button>
          </form>
        </div>

        {quotesError ? (
          <p className="text-sm text-red-400">
            Failed to load quotes: {quotesError.message}
          </p>
        ) : safeQuotes.length ? (
          <div className="space-y-2">
            {safeQuotes.map((quote) => (
              <div
                key={quote.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 px-4 py-3"
              >
                <div>
                  <p className="font-medium">
                    Quote #{quote.id.slice(0, 8)} · {quote.status}
                  </p>
                  <p className="text-xs text-slate-400">
                    Created{" "}
                    {quote.created_at
                      ? new Date(quote.created_at).toLocaleString()
                      : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold">
                    {formatCurrency(quote.total)}
                  </span>
                  <Link href={`/quotes/${quote.id}`} className="hb-button">
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="hb-muted text-sm">
            No quotes yet. Generate your first AI quote above.
          </p>
        )}
      </div>
    </div>
  );
}
