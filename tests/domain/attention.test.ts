import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAttentionCutoffs, getAttentionItems } from "@/lib/domain/attention";
import {
  buildAttentionCounts,
  buildAttentionSummary,
  type AttentionInvoiceRow,
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
  it("returns zeros when nothing needs attention", () => {
    const today = new Date("2025-01-15T12:00:00Z");
    const summary = buildAttentionSummary({
      invoices: [],
      jobs: [],
      appointments: [],
      calls: [],
      messages: [],
      today,
    });
    const counts = buildAttentionCounts(summary);

    expect(summary.overdueInvoicesCount).toBe(0);
    expect(summary.stalledJobsCount).toBe(0);
    expect(summary.missedAppointmentsCount).toBe(0);
    expect(summary.callsMissingOutcomeCount).toBe(0);
    expect(summary.agingUnpaidInvoicesCount).toBe(0);
    expect(counts.overdueInvoicesCount).toBe(0);
    expect(counts.jobsNeedingAttentionCount).toBe(0);
    expect(counts.appointmentsNeedingAttentionCount).toBe(0);
    expect(counts.callsNeedingAttentionCount).toBe(0);
    expect(counts.agingUnpaidInvoicesCount).toBe(0);
    expect(counts.totalAttentionCount).toBe(0);
  });

  it("counts an overdue invoice", () => {
    const today = new Date("2025-01-15T12:00:00Z");
    const invoices: AttentionInvoiceRow[] = [
      {
        id: "inv_overdue_1",
        status: "sent",
        created_at: "2024-12-01T00:00:00Z",
        due_at: "2024-12-20T00:00:00Z",
        updated_at: "2024-12-20T00:00:00Z",
      },
    ];
    const summary = buildAttentionSummary({
      invoices,
      jobs: [],
      appointments: [],
      calls: [],
      messages: [],
      today,
    });
    const counts = buildAttentionCounts(summary);

    expect(summary.overdueInvoicesCount).toBe(1);
    expect(summary.overdueInvoiceIdsSample).toEqual(["inv_overdue_1"]);
    expect(counts.overdueInvoicesCount).toBe(1);
    expect(counts.totalAttentionCount).toBe(1);
  });

  it("separates aging unpaid from ordinary overdue invoices", () => {
    const today = new Date("2025-01-15T12:00:00Z");
    const invoices: AttentionInvoiceRow[] = [
      {
        id: "inv_recent_overdue",
        status: "sent",
        created_at: "2025-01-10T00:00:00Z",
        due_at: "2025-01-10T00:00:00Z",
        updated_at: "2025-01-10T00:00:00Z",
      },
      {
        id: "inv_aging_unpaid",
        status: "unpaid",
        created_at: "2024-12-01T00:00:00Z",
        due_at: "2024-12-05T00:00:00Z",
        updated_at: "2024-12-05T00:00:00Z",
      },
    ];
    const summary = buildAttentionSummary({
      invoices,
      jobs: [],
      appointments: [],
      calls: [],
      messages: [],
      today,
    });
    const counts = buildAttentionCounts(summary);

    expect(summary.overdueInvoicesCount).toBe(2);
    expect(summary.agingUnpaidInvoicesCount).toBe(1);
    expect(summary.agingUnpaidInvoiceIdsSample).toEqual(["inv_aging_unpaid"]);
    expect(counts.overdueInvoicesCount).toBe(2);
    expect(counts.agingUnpaidInvoicesCount).toBe(1);
    expect(counts.totalAttentionCount).toBe(3);
  });
});
