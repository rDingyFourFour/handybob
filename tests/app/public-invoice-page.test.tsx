import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createAdminClientMock = vi.fn();

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

import PublicInvoicePage from "@/app/public/invoices/[token]/page";

describe("public invoice page", () => {
  let supabaseState = setupSupabaseMock();

  beforeEach(() => {
    supabaseState = setupSupabaseMock();
    createAdminClientMock.mockReset();
    createAdminClientMock.mockReturnValue(supabaseState.supabase);
  });

  it("renders invoice snapshot details for a valid token", async () => {
    supabaseState.responses.invoices = {
      data: [
        {
          id: "invoice-1",
          invoice_number: 1201,
          invoice_status: "sent",
          snapshot_subtotal_cents: 14000,
          snapshot_tax_cents: 1000,
          snapshot_total_cents: 15000,
          snapshot_summary: "Fixture install",
          currency: "USD",
          created_at: "2025-01-01T00:00:00.000Z",
          line_items: [
            { description: "Install", quantity: 1, unit_price: 150, total: 150 },
          ],
          workspaces: {
            name: "HandyBob",
            brand_name: "HandyBob",
            brand_tagline: null,
            business_email: "hello@example.com",
            business_phone: null,
            business_address: null,
          },
        },
      ],
      error: null,
    };

    const markup = renderToStaticMarkup(
      await PublicInvoicePage({ params: Promise.resolve({ token: "token-123" }) }),
    );

    expect(markup).toContain("Invoice #1201");
    expect(markup).toContain("$150.00");
    expect(markup).toContain("Line items");
  });

  it("renders a not found state for invalid tokens", async () => {
    supabaseState.responses.invoices = { data: [], error: null };

    const markup = renderToStaticMarkup(
      await PublicInvoicePage({ params: Promise.resolve({ token: "missing" }) }),
    );

    expect(markup).toContain("Invoice not found");
  });
});
