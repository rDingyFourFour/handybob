import { isCompletedJobStatus } from "@/lib/domain/jobs/jobListUi";

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

const INVOICE_OVERDUE_MIN_DAYS = 1;
const INVOICE_AGING_MIN_DAYS = 30;
export const JOB_STALLED_MIN_DAYS = 14;

function parseDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeOutcome(outcome: string | null | undefined): string | null {
  const normalized = outcome?.trim();
  return normalized ? normalized : null;
}

function sampleIds(rows: Array<{ id: string }>, limit = 5) {
  return rows.slice(0, limit).map((row) => row.id);
}

const UNPAID_LIKE_STATUSES = new Set([
  "sent",
  "queued",
  "unpaid",
  "partial",
  "overdue",
]);

export type AttentionInvoiceRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  due_date?: string | null;
  due_at?: string | null;
  total_cents?: number | null;
};

function getInvoiceReferenceDateForAttention(invoice: AttentionInvoiceRow): Date | null {
  const raw = invoice.due_date ?? invoice.due_at ?? invoice.created_at;
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getJobReferenceDateForAttention(job: AttentionJobRow): Date | null {
  const referenceValue = job.last_activity_at ?? job.updated_at ?? job.created_at;
  return parseDate(referenceValue);
}

export type AttentionJobRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_activity_at?: string | null;
};

export type AttentionAppointmentRow = {
  id: string;
  status: string | null;
  start_time: string | null;
  end_time: string | null;
};

export type AttentionCallRow = {
  id: string;
  created_at: string | null;
  outcome: string | null;
};

export type AttentionMessageRow = {
  id: string;
  created_at: string | null;
};

export type AttentionInput = {
  invoices: AttentionInvoiceRow[];
  jobs: AttentionJobRow[];
  appointments: AttentionAppointmentRow[];
  calls: AttentionCallRow[];
  messages: AttentionMessageRow[];
  today: Date;
};

export type AttentionSummary = {
  overdueInvoices: AttentionInvoiceRow[];
  stalledJobs: AttentionJobRow[];
  missedAppointments: AttentionAppointmentRow[];
  callsMissingOutcome: AttentionCallRow[];
  agingUnpaidInvoices: AttentionInvoiceRow[];
  overdueInvoicesCount: number;
  stalledJobsCount: number;
  missedAppointmentsCount: number;
  callsMissingOutcomeCount: number;
  agingUnpaidInvoicesCount: number;
  messagesNeedingAttentionCount: number;
  overdueInvoiceIdsSample: string[];
  stalledJobIdsSample: string[];
  missedAppointmentIdsSample: string[];
  callsMissingOutcomeIdsSample: string[];
  agingUnpaidInvoiceIdsSample: string[];
};

export type AttentionCounts = {
  overdueInvoicesCount: number;
  jobsNeedingAttentionCount: number;
  appointmentsNeedingAttentionCount: number;
  callsNeedingAttentionCount: number;
  agingUnpaidInvoicesCount: number;
  totalAttentionCount: number;
};

export function isInvoiceOverdueForAttention(
  invoice: AttentionInvoiceRow,
  today: Date
): boolean {
  const status = (invoice.status ?? "").toLowerCase();

  // Skip anything that is clearly not actionable
  if (!status || status === "draft" || status === "void" || status === "paid") {
    return false;
  }

  if (!UNPAID_LIKE_STATUSES.has(status)) {
    // Unknown status: be conservative and treat it as not overdue for now
    return false;
  }

  const referenceDate = getInvoiceReferenceDateForAttention(invoice);
  if (referenceDate === null) {
    return false;
  }

  const daysSinceReference = Math.floor(
    (today.getTime() - referenceDate.getTime()) / ONE_DAY_MS
  );

  return daysSinceReference >= INVOICE_OVERDUE_MIN_DAYS;
}

export function isInvoiceAgingUnpaidForAttention(
  invoice: AttentionInvoiceRow,
  today: Date
): boolean {
  if (!isInvoiceOverdueForAttention(invoice, today)) {
    return false;
  }

  const referenceDate = getInvoiceReferenceDateForAttention(invoice);
  if (referenceDate === null) {
    return false;
  }

  const daysSinceReference = Math.floor(
    (today.getTime() - referenceDate.getTime()) / ONE_DAY_MS
  );

  return daysSinceReference >= INVOICE_AGING_MIN_DAYS;
}

export function isJobStalledForAttention(job: AttentionJobRow, today: Date): boolean {
  const status = job.status ?? "";
  if (!status) {
    return false;
  }
  if (isCompletedJobStatus(status)) {
    return false;
  }
  const referenceDate = getJobReferenceDateForAttention(job);
  if (referenceDate === null) {
    return false;
  }
  const daysSinceReference = Math.floor(
    (today.getTime() - referenceDate.getTime()) / ONE_DAY_MS
  );
  return daysSinceReference >= JOB_STALLED_MIN_DAYS;
}

export function isAppointmentMissedForAttention(
  appointment: AttentionAppointmentRow,
  today: Date
): boolean {
  const status = (appointment.status ?? "").toLowerCase();
  if (status !== "scheduled") {
    return false;
  }
  const referenceTime = parseDate(appointment.end_time ?? appointment.start_time);
  if (referenceTime === null) {
    return false;
  }
  return referenceTime.getTime() < today.getTime();
}

export function isCallMissingOutcomeForAttention(
  call: AttentionCallRow,
  today: Date
): boolean {
  const normalized = normalizeOutcome(call.outcome);
  if (normalized) {
    return false;
  }
  const createdAt = parseDate(call.created_at);
  if (createdAt === null) {
    return false;
  }
  return today.getTime() - createdAt.getTime() >= ONE_DAY_MS;
}

export function buildAttentionSummary(input: AttentionInput): AttentionSummary {
  const { today, invoices, jobs, appointments, calls, messages } = input;
  const overdueInvoices = invoices.filter((invoice) =>
    isInvoiceOverdueForAttention(invoice, today)
  );
  const agingUnpaidInvoices = invoices.filter((invoice) =>
    isInvoiceAgingUnpaidForAttention(invoice, today)
  );
  const stalledJobs = jobs.filter((job) => isJobStalledForAttention(job, today));
  const missedAppointments = appointments.filter((appointment) =>
    isAppointmentMissedForAttention(appointment, today)
  );
  const callsMissingOutcome = calls.filter((call) =>
    isCallMissingOutcomeForAttention(call, today)
  );

  return {
    overdueInvoices,
    stalledJobs,
    missedAppointments,
    callsMissingOutcome,
    agingUnpaidInvoices,
    overdueInvoicesCount: overdueInvoices.length,
    stalledJobsCount: stalledJobs.length,
    missedAppointmentsCount: missedAppointments.length,
    callsMissingOutcomeCount: callsMissingOutcome.length,
    agingUnpaidInvoicesCount: agingUnpaidInvoices.length,
    messagesNeedingAttentionCount: messages.length,
    overdueInvoiceIdsSample: sampleIds(overdueInvoices),
    stalledJobIdsSample: sampleIds(stalledJobs),
    missedAppointmentIdsSample: sampleIds(missedAppointments),
    callsMissingOutcomeIdsSample: sampleIds(callsMissingOutcome),
    agingUnpaidInvoiceIdsSample: sampleIds(agingUnpaidInvoices),
  };
}

export function buildAttentionCounts(summary: AttentionSummary): AttentionCounts {
  const jobsNeedingAttentionCount = summary.stalledJobsCount;
  const totalAttentionCount =
    summary.overdueInvoicesCount +
    jobsNeedingAttentionCount +
    summary.missedAppointmentsCount +
    summary.callsMissingOutcomeCount +
    summary.agingUnpaidInvoicesCount;
  return {
    overdueInvoicesCount: summary.overdueInvoicesCount,
    jobsNeedingAttentionCount,
    appointmentsNeedingAttentionCount: summary.missedAppointmentsCount,
    callsNeedingAttentionCount: summary.callsMissingOutcomeCount,
    agingUnpaidInvoicesCount: summary.agingUnpaidInvoicesCount,
    totalAttentionCount,
  };
}

export function hasAnyAttention(
  summaryOrCounts: AttentionSummary | AttentionCounts,
  options?: { messagesNeedingAttentionCount?: number }
): boolean {
  const counts =
    "stalledJobsCount" in summaryOrCounts
      ? buildAttentionCounts(summaryOrCounts)
      : summaryOrCounts;
  const missingMessagesCount = options?.messagesNeedingAttentionCount ?? 0;
  return (
    counts.overdueInvoicesCount > 0 ||
    counts.jobsNeedingAttentionCount > 0 ||
    counts.appointmentsNeedingAttentionCount > 0 ||
    counts.callsNeedingAttentionCount > 0 ||
    counts.agingUnpaidInvoicesCount > 0 ||
    missingMessagesCount > 0
  );
}
