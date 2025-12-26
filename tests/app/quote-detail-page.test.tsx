import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockResolveWorkspaceContext = vi.fn();
const mockRedirect = vi.fn();

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

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("@/components/quotes/QuoteDetailsCard", () => ({
  __esModule: true,
  default: () => <div>QuoteDetailsCard mock</div>,
}));

import QuoteDetailPage from "@/app/(app)/quotes/[id]/page";

describe("QuoteDetailPage", () => {
  beforeEach(() => {
    mockRedirect.mockReset();
    createServerClientMock.mockReset();
    mockResolveWorkspaceContext.mockReset();
  });

  it("redirects to login when unauthenticated", async () => {
    const supabaseState = setupSupabaseMock();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: false,
      code: "unauthenticated",
    });

    await QuoteDetailPage({ params: Promise.resolve({ id: "quote-1" }) });

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("renders access denied when membership is missing", async () => {
    const supabaseState = setupSupabaseMock();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: false,
      code: "no_membership",
    });

    const markup = renderToStaticMarkup(
      await QuoteDetailPage({ params: Promise.resolve({ id: "quote-1" }) }),
    );

    expect(markup).toContain("Access denied");
  });

  it("renders the quote details inside the stable shell when authorized", async () => {
    const supabaseState = setupSupabaseMock({
      quotes: {
        data: [
          {
            id: "quote-1",
            workspace_id: "workspace-1",
            user_id: "user-1",
            job_id: "job-1",
            status: "draft",
            subtotal: 100,
            tax: 10,
            total: 110,
            line_items: [],
            client_message_template: null,
            public_token: null,
            created_at: "2025-01-01T00:00:00.000Z",
            updated_at: "2025-01-01T00:00:00.000Z",
            accepted_at: null,
            paid_at: null,
            smart_quote_used: false,
          },
        ],
        error: null,
      },
    });
    createServerClientMock.mockReturnValue(supabaseState.supabase);
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

    const markup = renderToStaticMarkup(
      await QuoteDetailPage({ params: Promise.resolve({ id: "quote-1" }) }),
    );

    expect(markup).toContain("hb-shell");
    expect(markup).toContain("QuoteDetailsCard mock");
  });
});
