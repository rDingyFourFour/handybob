import { beforeEach, describe, expect, it, vi } from "vitest";

import { ensureInvoiceForQuote } from "@/utils/invoices/ensureInvoiceForQuote";

type LineItemRow = {
  description: string;
  amount: number;
};

type QuoteRow = {
  id: string;
  total: number;
  status: string;
  user_id: string;
  workspace_id: string;
  subtotal: number;
  tax: number;
  line_items: LineItemRow[];
  jobs: { title: string; customers: { name: string; email: string }[] };
};

type InvoiceRow = {
  id: string;
  quote_id: string;
  status: string;
  stripe_payment_intent_id?: string;
};

type SupabaseState = {
  quotes: QuoteRow[];
  invoices: InvoiceRow[];
};

type SupabaseMock = {
  state: SupabaseState;
  from: (table: string) => Record<string, unknown>;
};

type EnsureInvoiceArgs = Parameters<typeof ensureInvoiceForQuote>[0];

function makeSupabaseMock(initial?: Partial<SupabaseState>) {
  const state: SupabaseState = {
    quotes: [
      {
        id: "quote_1",
        total: 250,
        status: "sent",
        user_id: "user_1",
        workspace_id: "ws_1",
        subtotal: 230,
        tax: 20,
        line_items: [],
        jobs: { title: "Kitchen repair", customers: [{ name: "Sam", email: "sam@example.com" }] },
      },
    ],
    invoices: [],
    ...initial,
  };

  const supabase: SupabaseMock = {
    state,
    from(table: string) {
      switch (table) {
        case "invoices":
          return {
            select: () => ({
              eq: (_col: string, quoteId: string) => ({
                maybeSingle: async () => ({
                  data: state.invoices.find((inv) => inv.quote_id === quoteId) ?? null,
                  error: null,
                }),
              }),
            }),
            update: (payload: Partial<InvoiceRow>) => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => {
                    const existing = state.invoices[0];
                    Object.assign(existing, payload);
                    return { data: existing, error: null };
                  },
                }),
              }),
            }),
            insert: (payload: Omit<InvoiceRow, "id">) => ({
              select: () => ({
                single: async () => {
                  const row = { id: `inv_${state.invoices.length + 1}`, ...payload };
                  state.invoices.push(row);
                  return { data: row, error: null };
                },
              }),
            }),
          };
        case "quotes":
          return {
            select: () => ({
              eq: (_col: string, quoteId: string) => ({
                maybeSingle: async () => ({
                  data: state.quotes.find((q) => q.id === quoteId) ?? null,
                  error: null,
                }),
              }),
            }),
          };
        default:
          return { select: () => ({}) };
      }
    },
  };

  return supabase;
}

vi.mock("@/utils/audit/log", () => ({
  logAuditEvent: vi.fn(),
}));

let supabaseMock = makeSupabaseMock();

describe("ensureInvoiceForQuote", () => {
  beforeEach(() => {
    supabaseMock = makeSupabaseMock();
  });

  it("creates a new invoice when one does not exist", async () => {
    const invoice = await ensureInvoiceForQuote({
      supabase: supabaseMock as EnsureInvoiceArgs["supabase"],
      quoteId: "quote_1",
      markPaid: true,
      paidAt: "2024-01-01T00:00:00.000Z",
      paymentIntentId: "pi_123",
    });

    expect(invoice).toBeTruthy();
    expect(supabaseMock.state.invoices).toHaveLength(1);
    expect(invoice).toMatchObject({
      quote_id: "quote_1",
      status: "paid",
      stripe_payment_intent_id: "pi_123",
    });
  });
});
