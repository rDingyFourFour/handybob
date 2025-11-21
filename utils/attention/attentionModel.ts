// HandyBob attention model:
// Defines the buckets we treat as "needs attention" so UI dashboards and background jobs can query consistently.
// Categories:
// - new_leads: jobs with status='lead' created within NEW_LEAD_DAYS.
// - stale_quotes: quotes in status='sent' older than QUOTE_STALE_DAYS without acceptance/payment.
// - overdue_invoices: invoices in status='sent' or 'overdue' with due_at in the past.
// - upcoming_or_pastdue_appointments: appointments today or earlier that are not completed.
// - unprocessed_calls: calls missing transcript/summary or job links (follow-up required).
// - unprocessed_messages: inbound messages/notes not yet triaged (placeholder for future expansion).

export type AttentionCategoryKey =
  | "new_leads"
  | "stale_quotes"
  | "overdue_invoices"
  | "upcoming_or_pastdue_appointments"
  | "unprocessed_calls"
  | "unprocessed_messages";

export type AttentionCategory = {
  key: AttentionCategoryKey;
  label: string;
  criteria: string;
};

export const ATTENTION_WINDOWS = {
  NEW_LEAD_DAYS: 7,
  QUOTE_STALE_DAYS: 3,
  INVOICE_OVERDUE_GRACE_DAYS: 0,
};

export const ATTENTION_MODEL: AttentionCategory[] = [
  {
    key: "new_leads",
    label: "New leads",
    criteria: "jobs.status = 'lead' created within NEW_LEAD_DAYS",
  },
  {
    key: "stale_quotes",
    label: "Quotes needing reply",
    criteria: "quotes.status = 'sent' older than QUOTE_STALE_DAYS and not accepted/paid",
  },
  {
    key: "overdue_invoices",
    label: "Invoices to collect",
    criteria: "invoices.status in ('sent','overdue') with due_at before today - INVOICE_OVERDUE_GRACE_DAYS",
  },
  {
    key: "upcoming_or_pastdue_appointments",
    label: "Today or past-due appointments",
    criteria: "appointments.start_time <= end of today and status != 'completed'",
  },
  {
    key: "unprocessed_calls",
    label: "Calls needing processing",
    criteria: "calls missing transcript/summary or without linked job",
  },
  {
    key: "unprocessed_messages",
    label: "Messages needing triage",
    criteria: "inbound messages flagged for follow-up (placeholder for future queues)",
  },
];

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export function newLeadCutoff(now = new Date()) {
  return addDays(now, -ATTENTION_WINDOWS.NEW_LEAD_DAYS);
}

export function staleQuoteCutoff(now = new Date()) {
  return addDays(now, -ATTENTION_WINDOWS.QUOTE_STALE_DAYS);
}

export function overdueInvoiceCutoff(now = new Date()) {
  return addDays(now, -ATTENTION_WINDOWS.INVOICE_OVERDUE_GRACE_DAYS);
}
