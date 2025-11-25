import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAttentionCutoffs, getAttentionItems } from "@/lib/domain/attention";

type TableName = "jobs" | "quotes" | "invoices" | "calls";

type SupabaseQuery = {
  select: () => SupabaseQuery;
  eq: (...args: unknown[]) => SupabaseQuery;
  gte: (...args: unknown[]) => SupabaseQuery;
  lt: (...args: unknown[]) => SupabaseQuery;
  order: (...args: unknown[]) => SupabaseQuery;
  limit: (size: number) => Promise<{ data: unknown[] | null; error: unknown | null }>;
};

type SupabaseState = {
  supabase: {
    from: (table: TableName) => SupabaseQuery;
  };
  queries: Record<TableName, SupabaseQuery>;
  limitErrors: Partial<Record<TableName, Error>>;
};

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

const defaultResponses: Record<TableName, { data: unknown[]; error: null }> = {
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

let supabaseState: SupabaseState;

function createQuery(table: TableName, state: SupabaseState): SupabaseQuery {
  const query: SupabaseQuery = {
    select: () => query,
    eq: () => query,
    gte: () => query,
    lt: () => query,
    order: () => query,
    limit: vi.fn(async () => {
      if (state.limitErrors[table]) {
        return Promise.reject(state.limitErrors[table]);
      }
      return Promise.resolve(defaultResponses[table]);
    }),
  };
  return query;
}

function setupSupabaseMock(): SupabaseState {
  const state: SupabaseState = {
    supabase: {
      from: vi.fn((table: TableName) => {
        const query = createQuery(table, state);
        state.queries[table] = query;
        return query;
      }),
    },
    queries: {} as Record<TableName, SupabaseQuery>,
    limitErrors: {},
  };
  return state;
}

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => supabaseState.supabase,
}));

describe("getAttentionCutoffs", () => {
  it("calculates attention windows relative to the provided date", () => {
    const reference = new Date("2024-01-08T00:00:00.000Z");
    const { newLeadWindowStart, staleQuoteCutoff, overdueInvoiceCutoff } =
      getAttentionCutoffs(reference);

    expect(newLeadWindowStart.toISOString().slice(0, 10)).toBe("2024-01-01");
    expect(staleQuoteCutoff.toISOString().slice(0, 10)).toBe("2024-01-05");
    expect(overdueInvoiceCutoff.toISOString().slice(0, 10)).toBe("2024-01-08");
  });
});

describe("getAttentionItems", () => {
  beforeEach(() => {
    supabaseState = setupSupabaseMock();
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
