import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();
const mockGetAppliedQuoteForJob = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: () => mockGetCurrentWorkspace(),
}));

vi.mock("@/lib/domain/quotes/appliedQuote", () => ({
  getAppliedQuoteForJob: (...args: unknown[]) => mockGetAppliedQuoteForJob(...args),
}));

import { createInvoiceFromAppliedQuoteAction } from "@/app/(app)/invoices/actions/createInvoiceFromAppliedQuoteAction";

const JOB_ROW = {
  id: "job-1",
  title: "Fixture install",
  workspace_id: "workspace-1",
  customer_id: "customer-1",
  customers: { id: "customer-1", name: "Taylor", phone: "+15551234567", email: "taylor@example.com" },
};

const QUOTE_ROW = {
  id: "quote-1",
  job_id: "job-1",
  workspace_id: "workspace-1",
  status: "accepted",
  subtotal: 150,
  tax: 15,
  total: 165,
  client_message_template: "Thanks for approving this work.",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("createInvoiceFromAppliedQuoteAction", () => {
  let supabaseState = setupSupabaseMock();

  beforeEach(() => {
    supabaseState = setupSupabaseMock();
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    };
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
    });
    mockGetAppliedQuoteForJob.mockReset();
    mockGetAppliedQuoteForJob.mockResolvedValue({ ok: true, quote: QUOTE_ROW });
  });

  it("returns missing_applied_quote when no applied quote exists", async () => {
    supabaseState.responses.jobs = { data: [JOB_ROW], error: null };
    mockGetAppliedQuoteForJob.mockResolvedValue({ ok: false, reason: "missing_applied_quote" });

    const formData = new FormData();
    formData.append("workspaceId", "workspace-1");
    formData.append("jobId", "job-1");

    const result = await createInvoiceFromAppliedQuoteAction(null, formData);

    expect(result.success).toBe(false);
    expect(result.code).toBe("missing_applied_quote");
    if (supabaseState.queries.invoices?.insert) {
      expect(supabaseState.queries.invoices.insert.mock.calls.length).toBe(0);
    } else {
      expect(supabaseState.queries.invoices).toBeUndefined();
    }
  });

  it("creates an invoice snapshot from an applied quote", async () => {
    supabaseState.responses.jobs = { data: [JOB_ROW], error: null };
    supabaseState.responses.invoices = [
      { data: [], error: null },
      { data: [{ id: "invoice-1" }], error: null },
    ];

    const formData = new FormData();
    formData.append("workspaceId", "workspace-1");
    formData.append("jobId", "job-1");

    const result = await createInvoiceFromAppliedQuoteAction(null, formData);

    expect(result.success).toBe(true);
    expect(result.invoiceId).toBe("invoice-1");
    expect(result.quoteId).toBe("quote-1");
    expect(result.totalCents).toBe(16500);

    const insertPayload = supabaseState.queries.invoices.insert.mock.calls[0]?.[0];
    expect(insertPayload).toMatchObject({
      workspace_id: "workspace-1",
      job_id: "job-1",
      quote_id: "quote-1",
      total_cents: 16500,
      tax_total_cents: 1500,
      labor_total_cents: 15000,
      customer_name_snapshot: "Taylor",
      notes_snapshot: "Thanks for approving this work.",
    });
  });

  it("returns already_exists when an invoice exists for the job", async () => {
    supabaseState.responses.jobs = { data: [JOB_ROW], error: null };
    supabaseState.responses.invoices = { data: [{ id: "invoice-1", quote_id: "quote-1", total_cents: 1000 }], error: null };

    const formData = new FormData();
    formData.append("workspaceId", "workspace-1");
    formData.append("jobId", "job-1");

    const result = await createInvoiceFromAppliedQuoteAction(null, formData);

    expect(result.success).toBe(false);
    expect(result.code).toBe("already_exists");
    expect(result.invoiceId).toBe("invoice-1");
    expect(supabaseState.queries.invoices.insert.mock.calls.length).toBe(0);
  });

  it("rejects cross-workspace job mismatches", async () => {
    supabaseState.responses.jobs = { data: [], error: null };

    const formData = new FormData();
    formData.append("workspaceId", "workspace-1");
    formData.append("jobId", "job-1");

    const result = await createInvoiceFromAppliedQuoteAction(null, formData);

    expect(result.success).toBe(false);
    expect(result.code).toBe("job_workspace_mismatch");
  });

  it("rejects cross-workspace quote mismatches", async () => {
    supabaseState.responses.jobs = { data: [JOB_ROW], error: null };
    supabaseState.responses.invoices = { data: [], error: null };
    mockGetAppliedQuoteForJob.mockResolvedValue({
      ok: true,
      quote: { ...QUOTE_ROW, workspace_id: "workspace-2" },
    });

    const formData = new FormData();
    formData.append("workspaceId", "workspace-1");
    formData.append("jobId", "job-1");

    const result = await createInvoiceFromAppliedQuoteAction(null, formData);

    expect(result.success).toBe(false);
    expect(result.code).toBe("quote_workspace_mismatch");
  });
});
