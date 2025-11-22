import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { submitPublicBooking } from "@/app/public/bookings/[slug]/actions";

type WorkspaceRow = {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  brand_name: string | null;
  public_lead_form_enabled?: boolean | null;
  auto_confirmation_email_enabled?: boolean | null;
};

type SupabaseMockState = {
  workspaces: WorkspaceRow[];
  customers: any[];
  jobs: any[];
  lead_form_submissions: any[];
};

function makeSupabaseMock(initial?: Partial<SupabaseMockState>) {
  const state: SupabaseMockState = {
    workspaces: [
      {
        id: "ws_1",
        owner_id: "user_1",
        slug: "demo",
        name: "Demo Workspace",
        brand_name: "Demo",
        public_lead_form_enabled: true,
        auto_confirmation_email_enabled: false,
      },
    ],
    customers: [],
    jobs: [],
    lead_form_submissions: [],
    ...initial,
  };

  const supabase = {
    state,
    from(table: string) {
      switch (table) {
        case "workspaces":
          return {
            select: () => ({
              eq: (_col: string, value: string) => ({
                maybeSingle: async () => ({
                  data: state.workspaces.find((w) => w.slug === value) ?? null,
                }),
              }),
            }),
          };
        case "lead_form_submissions":
          return {
            select: (_cols: string, _opts?: unknown) => ({
              eq: () => ({
                eq: () => ({
                  gte: async () => ({ count: 0 }),
                }),
              }),
            }),
            insert: async (payload: any) => {
              state.lead_form_submissions.push(payload);
              return { data: payload };
            },
          };
        case "customers":
          return {
            select: () => ({
              eq: () => ({
                or: () => ({
                  limit: async () => ({ data: [] }),
                }),
              }),
            }),
            insert: (payload: any) => ({
              select: () => ({
                single: async () => {
                  const row = { ...payload, id: `cust_${state.customers.length + 1}` };
                  state.customers.push(row);
                  return { data: row, error: null };
                },
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: () => ({}),
              }),
            }),
          };
        case "jobs":
          return {
            insert: (payload: any) => ({
              select: () => ({
                single: async () => {
                  const row = { ...payload, id: `job_${state.jobs.length + 1}` };
                  state.jobs.push(row);
                  return { data: row, error: null };
                },
              }),
            }),
          };
        default:
          return {
            insert: async () => ({ data: null }),
            select: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          };
      }
    },
  };

  return supabase;
}

let supabaseMock = makeSupabaseMock();

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => supabaseMock,
}));

let mockHeaders = {
  get: (key: string) => (key.toLowerCase() === "x-forwarded-for" ? "203.0.113.10" : null),
};

vi.mock("next/headers", () => ({
  headers: vi.fn(() => mockHeaders),
}));

vi.mock("@/utils/ai/classifyJob", () => ({
  classifyJobWithAi: vi.fn(() => ({ ai_urgency: "normal" })),
}));

vi.mock("@/utils/automation/runLeadAutomations", () => ({
  runLeadAutomations: vi.fn(),
}));

vi.mock("@/utils/email/sendCustomerMessage", () => ({
  sendCustomerMessageEmail: vi.fn(),
}));

describe("submitPublicBooking", () => {
  beforeEach(() => {
    supabaseMock = makeSupabaseMock();
    mockHeaders = {
      get: (key: string) => (key.toLowerCase() === "x-forwarded-for" ? "203.0.113.10" : null),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a job from a web form submission", async () => {
    const formData = new FormData();
    formData.set("name", "Jane Doe");
    formData.set("email", "jane@example.com");
    formData.set("description", "Need help fixing a leaky faucet.");
    formData.set("urgency", "this_week");

    const result = await submitPublicBooking("demo", { status: "idle" }, formData);

    expect(result.status).toBe("success");
    expect(supabaseMock.state.customers).toHaveLength(1);
    expect(supabaseMock.state.jobs).toHaveLength(1);
    expect(supabaseMock.state.jobs[0]).toMatchObject({
      status: "lead",
      user_id: "user_1",
      workspace_id: "ws_1",
    });
    expect(supabaseMock.state.lead_form_submissions).toHaveLength(1);
  });
});
