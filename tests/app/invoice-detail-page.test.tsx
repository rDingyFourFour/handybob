import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();
const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: (...args: unknown[]) => mockGetCurrentWorkspace(...args),
}));

import InvoiceDetailPage from "@/app/(app)/invoices/[id]/page";

describe("Invoice detail page", () => {
  beforeEach(() => {
    mockRedirect.mockReset();
    mockGetCurrentWorkspace.mockReset();
    createServerClientMock.mockReset();
  });

  it("redirects to login when unauthenticated", async () => {
    const supabaseState = setupSupabaseMock();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({
      user: null,
      workspace: null,
      role: null,
      reason: "unauthenticated",
    });

    await expect(
      InvoiceDetailPage({ params: Promise.resolve({ id: "invoice-1" }) })
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("renders access denied when workspace membership is missing", async () => {
    const supabaseState = setupSupabaseMock();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({
      user: { id: "user-1" },
      workspace: null,
      role: null,
      reason: "no_membership",
    });

    const markup = renderToStaticMarkup(
      await InvoiceDetailPage({ params: Promise.resolve({ id: "invoice-1" }) })
    );

    expect(markup).toContain("Access denied");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("renders not found when the invoice is not in the workspace", async () => {
    const supabaseState = setupSupabaseMock({
      invoices: { data: [], error: null },
    });
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({
      user: { id: "user-1" },
      workspace: { id: "workspace-1", name: "Acme", owner_id: "user-1" },
      role: "owner",
    });

    const markup = renderToStaticMarkup(
      await InvoiceDetailPage({ params: Promise.resolve({ id: "invoice-1" }) })
    );

    expect(markup).toContain("Invoice not found");
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
