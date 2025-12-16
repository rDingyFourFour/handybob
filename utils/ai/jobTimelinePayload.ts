"use server";

import { createServerClient } from "@/utils/supabase/server";
import { TimelineEvent } from "@/types/ai";
import {
  getCallOutcomeCodeMetadata,
  getCallOutcomeMetadata,
} from "@/lib/domain/communications/callOutcomes";
import { getAskBobCallScriptBody } from "@/lib/domain/askbob/constants";
import { formatTwilioStatusLabel } from "@/utils/calls/twilioStatusLabel";

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
export async function buildJobTimelinePayload(jobId: string, workspaceId: string) {
  const supabase = await createServerClient();

  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, workspace_id, title, description_raw, category, urgency, status, customer_id, created_at, customers(name, email, phone)"
    )
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!job) {
    throw new Error("Job not found or access denied.");
  }

  const [quotesRes, appointmentsRes, messagesRes, callsRes, invoicesRes] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, status, total, created_at, updated_at, accepted_at, paid_at")
      .eq("job_id", jobId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("appointments")
      .select("title, start_time, status, location")
      .eq("job_id", jobId)
      .eq("workspace_id", workspaceId)
      .order("start_time", { ascending: false }),
    supabase
      .from("messages")
      .select("direction, subject, body, status, created_at, sent_at")
      .eq("job_id", jobId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("calls")
      .select(
      "id, job_id, customer_id, direction, status, twilio_status, started_at, duration_seconds, summary, ai_summary, transcript, reached_customer, outcome_code, outcome_recorded_at, outcome",
    )
      .eq("job_id", jobId)
      .eq("workspace_id", workspaceId)
      .order("started_at", { ascending: false })
      .limit(100),
    supabase
      .from("invoices")
      .select("invoice_number, status, total, created_at, issued_at, paid_at")
      .eq("job_id", jobId)
      .eq("workspace_id", workspaceId)
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
      .eq("workspace_id", workspaceId)
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

  calls.forEach((call) => {
    const callSummarySource = call.ai_summary?.trim() || call.summary?.trim() || null;
    const detailSegments: string[] = [];
    if (callSummarySource) {
      detailSegments.push(`Summary: ${truncate(callSummarySource, 200)}`);
    }
    if (call.transcript) {
      detailSegments.push(`Transcript: ${truncate(call.transcript, 200)}`);
    }
    const detailBase = detailSegments.length ? detailSegments.join(" ") : null;
    const detailSegmentsSuffix: string[] = [];
    let hasOutcomeSuffix = false;
    const outcomeMetadata = getCallOutcomeCodeMetadata(call.outcome_code);
    const legacyMetadata = getCallOutcomeMetadata(call.outcome);
    const outcomeLabel =
      outcomeMetadata.value || legacyMetadata.value ? (outcomeMetadata.value ? outcomeMetadata.label : legacyMetadata.label) : null;
    if (outcomeLabel) {
      detailSegmentsSuffix.push(`Outcome: ${outcomeLabel}`);
      hasOutcomeSuffix = true;
    }
    if (call.reached_customer === true) {
      detailSegmentsSuffix.push("Reached: yes");
      hasOutcomeSuffix = true;
    } else if (call.reached_customer === false) {
      detailSegmentsSuffix.push("Reached: no");
      hasOutcomeSuffix = true;
    }
    const telephonyStatusLabel = formatTwilioStatusLabel(call.twilio_status ?? call.status);
    if (telephonyStatusLabel) {
      detailSegmentsSuffix.push(`Telephony: ${telephonyStatusLabel}`);
    }
    const detailSuffix = detailSegmentsSuffix.length ? detailSegmentsSuffix.join(" · ") : null;
    const detail =
      detailBase && detailSuffix
        ? `${detailBase} · ${detailSuffix}`
        : detailBase || detailSuffix || null;
    events.push({
      type: "call",
      timestamp: call.started_at,
      title: `${call.direction === "inbound" ? "Inbound" : "Outbound"} call`,
      detail,
      status: call.twilio_status ?? call.status,
      askBobScript: Boolean(getAskBobCallScriptBody(call.ai_summary ?? null, call.summary ?? null)),
      callId: call.id ?? null,
      jobId: call.job_id ?? null,
      customerId: call.customer_id ?? null,
      hasOutcomeSuffix,
    });
  });

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

  const askBobSnapshotsRes = await supabase
    .from("askbob_job_task_snapshots")
    .select("payload")
    .eq("workspace_id", workspaceId)
    .eq("job_id", jobId)
    .eq("task", "job.schedule")
    .order("updated_at", { ascending: false })
    .limit(5);
  const askBobStartTimes = new Map<string, string | null>();
  (askBobSnapshotsRes.data ?? []).forEach((row) => {
    if (!row || typeof row !== "object") {
      return;
    }
    const payload = row.payload as { startAt?: string | null; friendlyLabel?: string | null } | null;
    if (!payload || !payload.startAt) {
      return;
    }
    if (!askBobStartTimes.has(payload.startAt)) {
      askBobStartTimes.set(payload.startAt, payload.friendlyLabel ?? null);
    }
  });

  const customerRecord = Array.isArray(job.customers) ? job.customers[0] : job.customers;

  const annotatedEvents = events.map((event) => {
    if (event.type === "appointment" && event.timestamp && askBobStartTimes.has(event.timestamp)) {
      const friendlyLabel = askBobStartTimes.get(event.timestamp);
      const detailParts = [];
      if (friendlyLabel) {
        detailParts.push(friendlyLabel);
      }
      if (event.detail) {
        detailParts.push(event.detail);
      }
      return {
        ...event,
        title: "AskBob scheduled appointment",
        detail: detailParts.join(" · ") || "AskBob scheduled a visit",
        status: "AskBob",
      };
    }
    return event;
  });

  const sortedEvents = [...annotatedEvents]
    .sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 150);

  return {
    job: {
      id: job.id,
      title: job.title ?? null,
      description: truncate(job.description_raw, 400),
      category: job.category ?? null,
      urgency: job.urgency ?? null,
      status: job.status ?? null,
      created_at: job.created_at ?? null,
      customer: customerRecord
        ? {
            name: customerRecord.name ?? null,
            email: customerRecord.email ?? null,
            phone: customerRecord.phone ?? null,
          }
        : null,
    },
    events: sortedEvents,
  };
}

function truncate(value: unknown, max = 300) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}
