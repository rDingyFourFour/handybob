import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();
vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: () => mockGetCurrentWorkspace(),
}));

import { createInvoiceFromAcceptedQuoteAction } from "@/app/(app)/invoices/actions/createInvoiceFromAcceptedQuoteAction";

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
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("createInvoiceFromAcceptedQuoteAction", () => {
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
  });

  it("creates an invoice snapshot from an accepted quote", async () => {
    supabaseState.responses.jobs = { data: [JOB_ROW], error: null };
    supabaseState.responses.quotes = { data: [QUOTE_ROW], error: null };
    supabaseState.responses.invoices = [
      { data: [], error: null },
      {
        data: [
          {
            id: "invoice-1",
            workspace_id: "workspace-1",
            job_id: "job-1",
            quote_id: "quote-1",
            currency: "USD",
            snapshot_subtotal_cents: 15000,
            snapshot_tax_cents: 1500,
            snapshot_total_cents: 16500,
            snapshot_summary: "Fixture install",
          },
        ],
        error: null,
      },
    ];

    const formData = new FormData();
    formData.append("workspaceId", "workspace-1");
    formData.append("jobId", "job-1");
    formData.append("quoteId", "quote-1");

    const result = await createInvoiceFromAcceptedQuoteAction(null, formData);

    expect(result.success).toBe(true);
    expect(result.invoiceId).toBe("invoice-1");

    const insertPayload = supabaseState.queries.invoices.insert.mock.calls[0]?.[0];
    expect(insertPayload).toMatchObject({
      workspace_id: "workspace-1",
      job_id: "job-1",
      quote_id: "quote-1",
      snapshot_total_cents: 16500,
      snapshot_tax_cents: 1500,
      snapshot_subtotal_cents: 15000,
      snapshot_summary: "Fixture install",
    });
  });

  it("returns quote_not_accepted when the quote is not accepted", async () => {
    supabaseState.responses.jobs = { data: [JOB_ROW], error: null };
    supabaseState.responses.quotes = { data: [{ ...QUOTE_ROW, status: "draft" }], error: null };
    supabaseState.responses.invoices = { data: [], error: null };

    const formData = new FormData();
    formData.append("workspaceId", "workspace-1");
    formData.append("jobId", "job-1");
    formData.append("quoteId", "quote-1");

    const result = await createInvoiceFromAcceptedQuoteAction(null, formData);

    expect(result.success).toBe(false);
    expect(result.code).toBe("quote_not_accepted");
  });

  it("returns already_exists when an invoice exists for the job", async () => {
    supabaseState.responses.jobs = { data: [JOB_ROW], error: null };
    supabaseState.responses.quotes = { data: [QUOTE_ROW], error: null };
    supabaseState.responses.invoices = { data: [{ id: "invoice-1" }], error: null };

    const formData = new FormData();
    formData.append("workspaceId", "workspace-1");
    formData.append("jobId", "job-1");
    formData.append("quoteId", "quote-1");

    const result = await createInvoiceFromAcceptedQuoteAction(null, formData);

    expect(result.success).toBe(false);
    expect(result.code).toBe("already_exists");
    expect(supabaseState.queries.invoices.insert.mock.calls.length).toBe(0);
  });

  it("returns forbidden for cross-workspace job mismatches", async () => {
    supabaseState.responses.jobs = {
      data: [{ ...JOB_ROW, workspace_id: "workspace-2" }],
      error: null,
    };

    const formData = new FormData();
    formData.append("workspaceId", "workspace-1");
    formData.append("jobId", "job-1");
    formData.append("quoteId", "quote-1");

    const result = await createInvoiceFromAcceptedQuoteAction(null, formData);

    expect(result.success).toBe(false);
    expect(result.code).toBe("forbidden");
  });
});
