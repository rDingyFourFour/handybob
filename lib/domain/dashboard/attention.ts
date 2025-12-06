const ONE_DAY_MS = 1000 * 60 * 60 * 24;

type JobRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  last_activity_at?: string | null;
};

type InvoiceRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  due_date: string | null;
};

type AppointmentRow = {
  id: string;
  status: string | null;
  start_time: string | null;
  end_time: string | null;
};

type CallRow = {
  id: string;
  created_at: string | null;
  outcome: string | null;
};

type MessageRow = {
  id: string;
  created_at: string | null;
};

type AttentionInput = {
  jobs: JobRow[];
  invoices: InvoiceRow[];
  appointments: AppointmentRow[];
  calls: CallRow[];
  messages: MessageRow[];
  now?: Date;
};

type AttentionSummary = {
  overdueInvoices: InvoiceRow[];
  stalledJobs: JobRow[];
  missedAppointments: AppointmentRow[];
  callsMissingOutcome: CallRow[];
  agingUnpaidInvoices: InvoiceRow[];
};

type AttentionCounts = {
  overdueInvoicesCount: number;
  stalledJobsCount: number;
  missedAppointmentsCount: number;
  callsMissingOutcomeCount: number;
  agingUnpaidInvoicesCount: number;
};

type AttentionDebugSnapshot = AttentionCounts & {
  overdueInvoiceIdsSample: string[];
  stalledJobIdsSample: string[];
  missedAppointmentIdsSample: string[];
  callsMissingOutcomeIdsSample: string[];
  agingUnpaidInvoiceIdsSample: string[];
};

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

export function buildAttentionSummary(input: AttentionInput): AttentionSummary {
  const now = input.now ?? new Date();
  const todayStart = getStartOfDay(now);
  const overdueInvoices = input.invoices.filter((invoice) => {
    if (invoice.status !== "unpaid") {
      return false;
    }
    const dueDate = parseDate(invoice.due_date);
    return dueDate !== null && dueDate.getTime() < now.getTime();
  });

  const agingUnpaidInvoices = input.invoices.filter((invoice) => {
    if (invoice.status !== "unpaid") {
      return false;
    }
    const createdDate = parseDate(invoice.created_at);
    return (
      createdDate !== null &&
      now.getTime() - createdDate.getTime() > 14 * ONE_DAY_MS
    );
  });

  const stalledJobs = input.jobs.filter((job) => {
    if (job.status !== "quoted") {
      return false;
    }
    const activitySource = job.last_activity_at ?? job.created_at;
    const activityDate = parseDate(activitySource);
    return (
      activityDate !== null &&
      now.getTime() - activityDate.getTime() > 7 * ONE_DAY_MS
    );
  });

  const missedAppointments = input.appointments.filter((appointment) => {
    if (appointment.status !== "scheduled") {
      return false;
    }
    const endTime = parseDate(appointment.end_time);
    return endTime !== null && endTime.getTime() < now.getTime();
  });

  const callsMissingOutcome = input.calls.filter((call) => {
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
  };
}

export function buildAttentionCounts(summary: AttentionSummary): AttentionCounts {
  return {
    overdueInvoicesCount: summary.overdueInvoices.length,
    stalledJobsCount: summary.stalledJobs.length,
    missedAppointmentsCount: summary.missedAppointments.length,
    callsMissingOutcomeCount: summary.callsMissingOutcome.length,
    agingUnpaidInvoicesCount: summary.agingUnpaidInvoices.length,
  };
}

function sampleIds(rows: { id: string }[], limit = 3) {
  return rows.slice(0, limit).map((row) => row.id);
}

export function buildAttentionDebugSnapshot(
  summary: AttentionSummary
): AttentionDebugSnapshot {
  const counts = buildAttentionCounts(summary);
  return {
    ...counts,
    overdueInvoiceIdsSample: sampleIds(summary.overdueInvoices),
    stalledJobIdsSample: sampleIds(summary.stalledJobs),
    missedAppointmentIdsSample: sampleIds(summary.missedAppointments),
    callsMissingOutcomeIdsSample: sampleIds(summary.callsMissingOutcome),
    agingUnpaidInvoiceIdsSample: sampleIds(summary.agingUnpaidInvoices),
  };
}
