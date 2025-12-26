import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockResolveWorkspaceContext = vi.fn();
const mockSendInvoiceEmail = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain/workspaces")>(
    "@/lib/domain/workspaces",
  );
  return {
    ...actual,
    resolveWorkspaceContext: () => mockResolveWorkspaceContext(),
  };
});

vi.mock("@/utils/email/sendInvoiceEmail", () => ({
  sendInvoiceEmail: (...args: unknown[]) => mockSendInvoiceEmail(...args),
}));

import { sendInvoiceAction } from "@/app/(app)/invoices/actions/sendInvoiceAction";

const BASE_INVOICE = {
  id: "invoice-1",
  workspace_id: "workspace-1",
  job_id: "job-1",
  invoice_status: "draft",
  sent_at: null,
  paid_at: null,
  voided_at: null,
  customer_email: "customer@example.com",
  customer_name: "Ada Customer",
  invoice_number: 1201,
  snapshot_total_cents: 15000,
  due_at: "2025-01-20T00:00:00.000Z",
};

describe("sendInvoiceAction", () => {
  let supabaseState = setupSupabaseMock();

  beforeEach(() => {
    supabaseState = setupSupabaseMock();
    createServerClientMock.mockReset();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockResolveWorkspaceContext.mockReset();
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: true,
      workspaceId: "workspace-1",
      userId: "user-1",
      membership: {
        user: { id: "user-1" },
        workspace: { id: "workspace-1" },
        role: "owner",
      },
    });
    mockSendInvoiceEmail.mockReset();
    mockSendInvoiceEmail.mockResolvedValue(undefined);
  });

  function buildFormData() {
    const formData = new FormData();
    formData.append("workspaceId", "workspace-1");
    formData.append("invoiceId", "invoice-1");
    formData.append("source", "job_detail");
    return formData;
  }

  function collectInvoiceUpdateCalls() {
    const updateCalls: unknown[][] = [];
    const fromCalls = supabaseState.supabase.from.mock.calls;
    const fromResults = supabaseState.supabase.from.mock.results;
    fromCalls.forEach((call, index) => {
      if (call[0] !== "invoices") return;
      const query = fromResults[index]?.value;
      const calls = query?.update?.mock?.calls ?? [];
      updateCalls.push(...calls);
    });
    return updateCalls;
  }

  it("sends the invoice, creates a token, and marks it sent", async () => {
    supabaseState.responses.invoices = [
      { data: [BASE_INVOICE], error: null },
      {
        data: [
          {
            id: "invoice-1",
            workspace_id: "workspace-1",
            invoice_public_token: null,
          },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
    ];
    supabaseState.responses.workspaces = {
      data: [
        {
          name: "HandyBob",
          brand_name: "HandyBob",
          brand_tagline: "We fix it",
          business_email: "hello@example.com",
          business_phone: null,
          business_address: null,
        },
      ],
      error: null,
    };

    const result = await sendInvoiceAction(null, buildFormData());

    expect(result.success).toBe(true);
    expect(mockSendInvoiceEmail).toHaveBeenCalledTimes(1);

    const updateCalls = collectInvoiceUpdateCalls();
    expect(updateCalls.length).toBe(2);
    expect(updateCalls[0][0]).toMatchObject({
      invoice_public_token: expect.any(String),
      invoice_public_token_created_at: expect.any(String),
    });
    expect(updateCalls[1][0]).toMatchObject({
      invoice_status: "sent",
      sent_at: expect.any(String),
    });
  });

  it("rejects already sent invoices", async () => {
    supabaseState.responses.invoices = [
      { data: [{ ...BASE_INVOICE, invoice_status: "sent", sent_at: "2025-01-01T00:00:00.000Z" }], error: null },
    ];

    const result = await sendInvoiceAction(null, buildFormData());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("invoice_not_sendable");
    }
    expect(mockSendInvoiceEmail).not.toHaveBeenCalled();
    expect(collectInvoiceUpdateCalls().length).toBe(0);
  });

  it("rejects missing customer email", async () => {
    supabaseState.responses.invoices = [
      { data: [{ ...BASE_INVOICE, customer_email: null }], error: null },
    ];

    const result = await sendInvoiceAction(null, buildFormData());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("missing_customer_email");
    }
    expect(mockSendInvoiceEmail).not.toHaveBeenCalled();
  });

  it("rejects cross-workspace invoices", async () => {
    supabaseState.responses.invoices = [
      { data: [{ ...BASE_INVOICE, workspace_id: "workspace-2" }], error: null },
    ];

    const result = await sendInvoiceAction(null, buildFormData());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("forbidden");
    }
    expect(mockSendInvoiceEmail).not.toHaveBeenCalled();
  });

  it("returns email_send_failed when provider throws", async () => {
    mockSendInvoiceEmail.mockRejectedValueOnce(new Error("provider down"));
    supabaseState.responses.invoices = [
      { data: [BASE_INVOICE], error: null },
      {
        data: [
          {
            id: "invoice-1",
            workspace_id: "workspace-1",
            invoice_public_token: null,
          },
        ],
        error: null,
      },
      { data: [], error: null },
    ];

    const result = await sendInvoiceAction(null, buildFormData());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("email_send_failed");
    }
    const updateCalls = collectInvoiceUpdateCalls();
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0][0]).toMatchObject({
      invoice_public_token: expect.any(String),
    });
  });
});
