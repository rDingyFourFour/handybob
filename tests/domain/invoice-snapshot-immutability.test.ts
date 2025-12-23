import { describe, expect, it } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import { createInvoiceFromAcceptedQuote } from "@/lib/domain/invoices/createInvoiceFromAcceptedQuote";
import { getInvoiceForJob } from "@/lib/domain/invoices/getInvoiceForJob";

const JOB_ROW = {
  id: "job-1",
  title: "Fixture install",
  workspace_id: "workspace-1",
};

const QUOTE_ROW = {
  id: "quote-1",
  job_id: "job-1",
  workspace_id: "workspace-1",
  status: "accepted",
  subtotal: 150,
  tax: 15,
  total: 165,
};

describe("invoice snapshot immutability", () => {
  it("returns the original snapshot totals after quote changes", async () => {
    const supabaseState = setupSupabaseMock({
      jobs: { data: [JOB_ROW], error: null },
      quotes: { data: [QUOTE_ROW], error: null },
      invoices: [
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
              created_at: new Date().toISOString(),
              invoice_status: "draft",
              sent_at: null,
              paid_at: null,
              voided_at: null,
            },
          ],
          error: null,
        },
      ],
    });

    const createResult = await createInvoiceFromAcceptedQuote({
      supabase: supabaseState.supabase,
      workspaceId: "workspace-1",
      jobId: "job-1",
      quoteId: "quote-1",
      userId: "user-1",
    });

    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    expect(createResult.invoice.snapshot_total_cents).toBe(16500);

    supabaseState.responses.quotes = {
      data: [{ ...QUOTE_ROW, subtotal: 500, tax: 50, total: 550 }],
      error: null,
    };

    const { invoice } = await getInvoiceForJob({
      supabase: supabaseState.supabase,
      workspaceId: "workspace-1",
      jobId: "job-1",
    });

    expect(invoice?.snapshot_total_cents).toBe(16500);
    expect(invoice?.snapshot_subtotal_cents).toBe(15000);
  });
});
