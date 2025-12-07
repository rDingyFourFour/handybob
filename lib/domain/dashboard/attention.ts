const ONE_DAY_MS = 1000 * 60 * 60 * 24;

function parseDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getStartOfDay(reference: Date): Date {
  const dayStart = new Date(reference);
  dayStart.setHours(0, 0, 0, 0);
  dayStart.setMilliseconds(0);
  return dayStart;
}

function normalizeOutcome(outcome: string | null | undefined): string | null {
  const normalized = outcome?.trim();
  return normalized ? normalized : null;
}

function sampleIds(rows: Array<{ id: string }>, limit = 5) {
  return rows.slice(0, limit).map((row) => row.id);
}

export type AttentionInvoiceRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  due_at: string | null;
  updated_at: string | null;
};

export type AttentionJobRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
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
  reference: Date = new Date()
) {
  const status = (invoice.status ?? "").toLowerCase();
  if (!status || status === "draft" || status === "paid") {
    return false;
  }
  const dueDateString = invoice.due_at ?? null;
  if (!dueDateString) {
    return false;
  }
  const dueDate = parseDate(dueDateString);
  if (dueDate === null) {
    return false;
  }
  return dueDate.getTime() < reference.getTime();
}

export function isInvoiceAgingUnpaidForAttention(
  invoice: AttentionInvoiceRow,
  reference: Date = new Date()
) {
  if (invoice.status !== "unpaid") {
    return false;
  }
  const createdDate = parseDate(invoice.created_at);
  if (createdDate === null) {
    return false;
  }
  return reference.getTime() - createdDate.getTime() > 14 * ONE_DAY_MS;
}

export function buildAttentionSummary(input: AttentionInput): AttentionSummary {
  const { today, invoices, jobs, appointments, calls, messages } = input;
  const todayStart = getStartOfDay(today);
  const overdueInvoices = invoices.filter((invoice) =>
    isInvoiceOverdueForAttention(invoice, today)
  );
  const agingUnpaidInvoices = invoices.filter((invoice) =>
    isInvoiceAgingUnpaidForAttention(invoice, today)
  );
  const stalledJobs = jobs.filter((job) => {
    if (job.status !== "quoted") {
      return false;
    }
    const activityDate = parseDate(job.updated_at ?? job.created_at ?? null);
    return (
      activityDate !== null &&
      today.getTime() - activityDate.getTime() > 7 * ONE_DAY_MS
    );
  });
  const missedAppointments = appointments.filter((appointment) => {
    if (appointment.status !== "scheduled") {
      return false;
    }
    const endTime = parseDate(appointment.end_time);
    return endTime !== null && endTime.getTime() < today.getTime();
  });
  const callsMissingOutcome = calls.filter((call) => {
    const normalized = normalizeOutcome(call.outcome);
    if (normalized) {
      return false;
    }
    const createdAt = parseDate(call.created_at);
    return createdAt !== null && createdAt.getTime() < todayStart.getTime();
  });

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
) {
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
