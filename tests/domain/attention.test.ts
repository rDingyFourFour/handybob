import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAttentionCutoffs, getAttentionItems } from "@/lib/domain/attention";
import {
  buildAttentionCounts,
  buildAttentionSummary,
  hasAnyAttention,
  isAppointmentMissedForAttention,
  isCallMissingOutcomeForAttention,
  isInvoiceAgingUnpaidForAttention,
  isInvoiceOverdueForAttention,
  isJobStalledForAttention,
  type AttentionAppointmentRow,
  type AttentionCallRow,
  type AttentionInvoiceRow,
  type AttentionJobRow,
} from "@/lib/domain/dashboard/attention";
import {
  setupSupabaseMock,
  type SupabaseQueryResponse,
} from "@/tests/setup/supabaseClientMock";

type TableName = "jobs" | "quotes" | "invoices" | "calls";

// These attention queries hit a mocked Supabase client, so opt in via an env flag.
const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === "1";
const describeAttentionItems = RUN_INTEGRATION_TESTS ? describe : describe.skip;

const sampleLead = {
  id: "lead-1",
  title: "Roof leak",
  urgency: "emergency",
  ai_urgency: "emergency",
  source: "manual",
  attention_reason: "Test",
  created_at: "2024-01-01T00:00:00.000Z",
  customer: { name: "Alex" },
};

const defaultResponses: Record<TableName, SupabaseQueryResponse> = {
  jobs: { data: [sampleLead], error: null },
  quotes: {
    data: [
      {
        id: "quote-1",
        status: "sent",
        total: 250,
        created_at: "2024-01-02T00:00:00.000Z",
        job_id: "job-1",
        job: { title: "Kitchen fix", customers: { name: "Alex" } },
      },
    ],
    error: null,
  },
  invoices: {
    data: [
      {
        id: "invoice-1",
        status: "sent",
        total: 300,
        due_at: "2024-01-03T00:00:00.000Z",
        job_id: "job-1",
        job: { title: "Kitchen fix", customers: { name: "Alex" } },
      },
    ],
    error: null,
  },
  calls: {
    data: [
      {
        id: "call-1",
        status: "voicemail",
        created_at: "2024-01-04T00:00:00.000Z",
        from_number: "5551234",
        priority: null,
        needs_followup: true,
        attention_reason: "needs follow-up",
        ai_urgency: null,
        job_id: null,
        jobs: null,
        customers: null,
      },
    ],
    error: null,
  },
};

let supabaseState = setupSupabaseMock(defaultResponses);

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => supabaseState.supabase,
}));

describe("getAttentionCutoffs", () => {
  it("calculates attention windows relative to the provided date", async () => {
    const reference = new Date("2024-01-08T00:00:00.000Z");
    const { newLeadWindowStart, staleQuoteCutoff, overdueInvoiceCutoff } =
      await getAttentionCutoffs(reference);

    expect(newLeadWindowStart.toISOString().slice(0, 10)).toBe("2024-01-01");
    expect(staleQuoteCutoff.toISOString().slice(0, 10)).toBe("2024-01-05");
    expect(overdueInvoiceCutoff.toISOString().slice(0, 10)).toBe("2024-01-08");
  });
});

describeAttentionItems("getAttentionItems", () => {
  beforeEach(() => {
    supabaseState = setupSupabaseMock(defaultResponses);
  });

  it("queries workspace-scoped attention rows and returns formatted data", async () => {
    const result = await getAttentionItems("workspace-1");

    expect(supabaseState.queries.jobs.eq).toHaveBeenCalledWith("workspace_id", "workspace-1");
    expect(result.leads).toHaveLength(1);
    expect(result.leadSourceCounts.manual).toBe(1);
    expect(result.urgentEmergencyCount).toBe(1);
    expect(result.quotes[0].tag).toBe("sent");
    expect(result.invoices[0].amount).toContain("$");
  });

  it("propagates Supabase errors", async () => {
    supabaseState.limitErrors.jobs = new Error("db failure");

    await expect(getAttentionItems("workspace-1")).rejects.toThrow("db failure");
  });
});

describe("buildAttentionSummary & counts", () => {
  const today = new Date("2025-01-15T12:00:00Z");

  it("flags an overdue invoice without aging", () => {
    const invoice: AttentionInvoiceRow = {
      id: "inv_recent_overdue",
      status: "sent",
      created_at: "2025-01-01T00:00:00Z",
      due_at: "2025-01-05T00:00:00Z",
      updated_at: "2025-01-05T00:00:00Z",
    };
    expect(isInvoiceOverdueForAttention(invoice, today)).toBe(true);
    expect(isInvoiceAgingUnpaidForAttention(invoice, today)).toBe(false);

    const summary = buildAttentionSummary({
      invoices: [invoice],
      jobs: [],
      appointments: [],
      calls: [],
      messages: [],
      today,
    });
    const counts = buildAttentionCounts(summary);

    expect(summary.overdueInvoicesCount).toBe(1);
    expect(summary.agingUnpaidInvoicesCount).toBe(0);
    expect(counts.totalAttentionCount).toBe(1);
  });

  it("flags aging unpaid invoices 30+ days late", () => {
    const invoice: AttentionInvoiceRow = {
      id: "inv_aging_unpaid",
      status: "queued",
      created_at: "2024-12-01T00:00:00Z",
      due_at: "2024-12-10T00:00:00Z",
      updated_at: "2024-12-10T00:00:00Z",
    };
    expect(isInvoiceOverdueForAttention(invoice, today)).toBe(true);
    expect(isInvoiceAgingUnpaidForAttention(invoice, today)).toBe(true);

    const summary = buildAttentionSummary({
      invoices: [invoice],
      jobs: [],
      appointments: [],
      calls: [],
      messages: [],
      today,
    });
    const counts = buildAttentionCounts(summary);

    expect(summary.overdueInvoicesCount).toBe(1);
    expect(summary.agingUnpaidInvoicesCount).toBe(1);
    expect(counts.totalAttentionCount).toBe(2);
  });

  it("returns zero counts when nothing needs attention", () => {
    const invoices: AttentionInvoiceRow[] = [
      {
        id: "inv_paid",
        status: "paid",
        created_at: "2025-01-01T00:00:00Z",
        due_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
      },
      {
        id: "inv_future",
        status: "sent",
        created_at: "2025-01-14T00:00:00Z",
        due_at: "2025-01-20T00:00:00Z",
        updated_at: "2025-01-14T00:00:00Z",
      },
    ];
    const jobs: AttentionJobRow[] = [
      {
        id: "job_closed",
        status: "completed",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-04T00:00:00Z",
      },
    ];
    const appointments: AttentionAppointmentRow[] = [
      {
        id: "appt_future",
        status: "scheduled",
        start_time: "2025-01-16T10:00:00Z",
        end_time: "2025-01-16T11:00:00Z",
      },
      {
        id: "appt_done",
        status: "completed",
        start_time: "2025-01-10T10:00:00Z",
        end_time: "2025-01-10T11:00:00Z",
      },
    ];
    const calls: AttentionCallRow[] = [
      {
        id: "call_done",
        created_at: "2025-01-14T12:00:00Z",
        outcome: "connected",
      },
      {
        id: "call_recent",
        created_at: "2025-01-15T10:00:00Z",
        outcome: null,
      },
    ];
    const summary = buildAttentionSummary({
      invoices,
      jobs,
      appointments,
      calls,
      messages: [],
      today,
    });
    const counts = buildAttentionCounts(summary);

    expect(summary.overdueInvoicesCount).toBe(0);
    expect(summary.stalledJobsCount).toBe(0);
    expect(summary.missedAppointmentsCount).toBe(0);
    expect(summary.callsMissingOutcomeCount).toBe(0);
    expect(summary.agingUnpaidInvoicesCount).toBe(0);
    expect(counts.totalAttentionCount).toBe(0);
    expect(hasAnyAttention(summary)).toBe(false);
  });

  it("identifies stalled jobs after a week but not before", () => {
    const attentionToday = new Date("2025-12-05T12:00:00Z");
    const jobStalled: AttentionJobRow = {
      id: "job_stalled",
      status: "quoted",
      created_at: "2025-11-10T00:00:00Z",
      updated_at: "2025-11-27T00:00:00Z",
    };
    const jobFresh: AttentionJobRow = {
      id: "job_fresh",
      status: "quoted",
      created_at: "2025-11-25T00:00:00Z",
      updated_at: "2025-12-02T00:00:00Z",
    };
    expect(isJobStalledForAttention(jobStalled, attentionToday)).toBe(true);
    expect(isJobStalledForAttention(jobFresh, attentionToday)).toBe(false);

    const summary = buildAttentionSummary({
      invoices: [],
      jobs: [jobStalled],
      appointments: [],
      calls: [],
      messages: [],
      today: attentionToday,
    });
    const counts = buildAttentionCounts(summary);

    expect(summary.stalledJobsCount).toBe(1);
    expect(counts.jobsNeedingAttentionCount).toBe(1);
    expect(hasAnyAttention(summary)).toBe(true);
  });

  it("flags missed appointments when scheduled time is past", () => {
    const appointmentMissed: AttentionAppointmentRow = {
      id: "appt_missed",
      status: "scheduled",
      start_time: "2025-01-15T09:00:00Z",
      end_time: "2025-01-15T10:00:00Z",
    };
    const appointmentFuture: AttentionAppointmentRow = {
      id: "appt_future",
      status: "scheduled",
      start_time: "2025-01-16T09:00:00Z",
      end_time: "2025-01-16T10:00:00Z",
    };
    expect(isAppointmentMissedForAttention(appointmentMissed, today)).toBe(true);
    expect(isAppointmentMissedForAttention(appointmentFuture, today)).toBe(false);

    const summary = buildAttentionSummary({
      invoices: [],
      jobs: [],
      appointments: [appointmentMissed],
      calls: [],
      messages: [],
      today,
    });
    const counts = buildAttentionCounts(summary);

    expect(summary.missedAppointmentsCount).toBe(1);
    expect(counts.appointmentsNeedingAttentionCount).toBe(1);
    expect(hasAnyAttention(summary)).toBe(true);
  });

  it("detects calls missing an outcome after one day", () => {
    const callLate: AttentionCallRow = {
      id: "call_late",
      created_at: "2025-01-13T12:00:00Z",
      outcome: null,
    };
    const callToday: AttentionCallRow = {
      id: "call_today",
      created_at: "2025-01-15T10:00:00Z",
      outcome: null,
    };
    const callDone: AttentionCallRow = {
      id: "call_done",
      created_at: "2025-01-10T12:00:00Z",
      outcome: "connected",
    };
    expect(isCallMissingOutcomeForAttention(callLate, today)).toBe(true);
    expect(isCallMissingOutcomeForAttention(callToday, today)).toBe(false);
    expect(isCallMissingOutcomeForAttention(callDone, today)).toBe(false);

    const summary = buildAttentionSummary({
      invoices: [],
      jobs: [],
      appointments: [],
      calls: [callLate, callToday, callDone],
      messages: [],
      today,
    });
    expect(summary.callsMissingOutcomeCount).toBe(1);
    expect(hasAnyAttention(summary)).toBe(true);
  });
});
