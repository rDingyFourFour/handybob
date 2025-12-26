import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockResolveWorkspaceContext = vi.fn();

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

import { updateInvoiceStatusAction } from "@/app/(app)/invoices/actions/updateInvoiceStatusAction";

const BASE_INVOICE = {
  id: "invoice-1",
  workspace_id: "workspace-1",
  job_id: "job-1",
  invoice_status: "draft",
  sent_at: null,
  paid_at: null,
  voided_at: null,
};

describe("updateInvoiceStatusAction", () => {
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
  });

  function buildFormData(targetStatus: string) {
    const formData = new FormData();
    formData.append("workspaceId", "workspace-1");
    formData.append("jobId", "job-1");
    formData.append("invoiceId", "invoice-1");
    formData.append("targetStatus", targetStatus);
    return formData;
  }

  it("transitions draft to sent and stamps sent_at", async () => {
    supabaseState.responses.invoices = [
      { data: [BASE_INVOICE], error: null },
      { data: [{ id: "invoice-1" }], error: null },
      {
        data: [
          {
            id: "invoice-1",
            invoice_status: "sent",
            sent_at: "2025-01-01T00:00:00.000Z",
            paid_at: null,
            voided_at: null,
          },
        ],
        error: null,
      },
    ];

    const result = await updateInvoiceStatusAction(null, buildFormData("sent"));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newStatus).toBe("sent");
      expect(result.sentAt).toBe("2025-01-01T00:00:00.000Z");
    }

    const updatePayload = supabaseState.queries.invoices.update?.mock.calls[0]?.[0];
    expect(updatePayload).toBeDefined();
    expect(Object.keys(updatePayload).sort()).toEqual(["invoice_status", "sent_at"]);
    expect(updatePayload.invoice_status).toBe("sent");
    expect(updatePayload.sent_at).toEqual(expect.any(String));
  });

  it("transitions sent to paid and stamps paid_at", async () => {
    supabaseState.responses.invoices = [
      {
        data: [
          {
            ...BASE_INVOICE,
            invoice_status: "sent",
            sent_at: "2025-01-01T00:00:00.000Z",
          },
        ],
        error: null,
      },
      { data: [{ id: "invoice-1" }], error: null },
      {
        data: [
          {
            id: "invoice-1",
            invoice_status: "paid",
            sent_at: "2025-01-01T00:00:00.000Z",
            paid_at: "2025-01-02T00:00:00.000Z",
            voided_at: null,
          },
        ],
        error: null,
      },
    ];

    const result = await updateInvoiceStatusAction(null, buildFormData("paid"));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newStatus).toBe("paid");
      expect(result.paidAt).toBe("2025-01-02T00:00:00.000Z");
    }

    const updatePayload = supabaseState.queries.invoices.update?.mock.calls[0]?.[0];
    expect(Object.keys(updatePayload).sort()).toEqual(["invoice_status", "paid_at"]);
  });

  it("transitions draft to void and stamps voided_at", async () => {
    supabaseState.responses.invoices = [
      { data: [BASE_INVOICE], error: null },
      { data: [{ id: "invoice-1" }], error: null },
      {
        data: [
          {
            id: "invoice-1",
            invoice_status: "void",
            sent_at: null,
            paid_at: null,
            voided_at: "2025-01-03T00:00:00.000Z",
          },
        ],
        error: null,
      },
    ];

    const result = await updateInvoiceStatusAction(null, buildFormData("void"));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newStatus).toBe("void");
      expect(result.voidedAt).toBe("2025-01-03T00:00:00.000Z");
    }

    const updatePayload = supabaseState.queries.invoices.update?.mock.calls[0]?.[0];
    expect(Object.keys(updatePayload).sort()).toEqual(["invoice_status", "voided_at"]);
  });

  it("transitions sent to void and stamps voided_at", async () => {
    supabaseState.responses.invoices = [
      {
        data: [
          {
            ...BASE_INVOICE,
            invoice_status: "sent",
            sent_at: "2025-01-01T00:00:00.000Z",
          },
        ],
        error: null,
      },
      { data: [{ id: "invoice-1" }], error: null },
      {
        data: [
          {
            id: "invoice-1",
            invoice_status: "void",
            sent_at: "2025-01-01T00:00:00.000Z",
            paid_at: null,
            voided_at: "2025-01-03T00:00:00.000Z",
          },
        ],
        error: null,
      },
    ];

    const result = await updateInvoiceStatusAction(null, buildFormData("void"));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.newStatus).toBe("void");
    }

    const updatePayload = supabaseState.queries.invoices.update?.mock.calls[0]?.[0];
    expect(Object.keys(updatePayload).sort()).toEqual(["invoice_status", "voided_at"]);
  });

  it("rejects paid to sent", async () => {
    supabaseState.responses.invoices = [
      {
        data: [
          {
            ...BASE_INVOICE,
            invoice_status: "paid",
            paid_at: "2025-01-02T00:00:00.000Z",
          },
        ],
        error: null,
      },
      { data: [{ id: "invoice-1" }], error: null },
    ];

    const result = await updateInvoiceStatusAction(null, buildFormData("sent"));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("invalid_transition");
    }
    expect(supabaseState.queries.invoices.update?.mock.calls.length ?? 0).toBe(0);
  });

  it("rejects void to paid", async () => {
    supabaseState.responses.invoices = [
      {
        data: [
          {
            ...BASE_INVOICE,
            invoice_status: "void",
            voided_at: "2025-01-03T00:00:00.000Z",
          },
        ],
        error: null,
      },
      { data: [{ id: "invoice-1" }], error: null },
    ];

    const result = await updateInvoiceStatusAction(null, buildFormData("paid"));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("invalid_transition");
    }
    expect(supabaseState.queries.invoices.update?.mock.calls.length ?? 0).toBe(0);
  });

  it("rejects cross-workspace invoices", async () => {
    supabaseState.responses.invoices = [
      {
        data: [
          {
            ...BASE_INVOICE,
            workspace_id: "workspace-2",
          },
        ],
        error: null,
      },
    ];

    const result = await updateInvoiceStatusAction(null, buildFormData("sent"));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("workspace_mismatch");
    }
  });

  it("rejects invoices attached to a different job", async () => {
    supabaseState.responses.invoices = [
      {
        data: [
          {
            ...BASE_INVOICE,
            job_id: "job-2",
          },
        ],
        error: null,
      },
    ];

    const result = await updateInvoiceStatusAction(null, buildFormData("sent"));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("job_mismatch");
    }
  });
});
