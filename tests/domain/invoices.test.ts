import { describe, expect, it } from "vitest";

import { ensureInvoiceForQuote } from "@/lib/domain/invoices";

describe("ensureInvoiceForQuote", () => {
  it("returns null when quote lookup fails", async () => {
    const supabaseMock = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              table === "invoices"
                ? { data: null, error: null }
                : { data: null, error: { message: "quote missing" } },
          }),
        }),
      }),
    };

    const result = await ensureInvoiceForQuote({
      supabase: supabaseMock,
      quoteId: "quote_1",
    });

    expect(result).toBeNull();
  });
});
