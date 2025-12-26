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

vi.mock("@/components/quotes/QuotesListClient", () => ({
  __esModule: true,
  default: ({ initialQuotes }: { initialQuotes: unknown[] }) => (
    <div data-testid="quotes-list" data-count={initialQuotes.length} />
  ),
}));

import QuotesPage from "@/app/(app)/quotes/page";

describe("QuotesPage", () => {
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

    await QuotesPage();

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("renders access denied when membership is missing", async () => {
    const supabaseState = setupSupabaseMock();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: false,
      code: "no_membership",
    });

    const markup = renderToStaticMarkup(await QuotesPage());

    expect(markup).toContain("Access denied");
  });

  it("keeps a stable shell when quotes are empty or populated", async () => {
    const supabaseState = setupSupabaseMock({
      quotes: { data: [], error: null },
    });
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: true,
      workspaceId: "workspace-1",
      userId: "user-1",
      membership: {
        user: { id: "user-1" },
        workspace: { id: "workspace-1", name: "Workspace" },
        role: "owner",
      },
    });

    const emptyMarkup = renderToStaticMarkup(await QuotesPage());
    expect(emptyMarkup.startsWith("<div")).toBe(true);
    expect(emptyMarkup).toContain("hb-shell");
    expect(emptyMarkup).toContain("data-testid=\"quotes-list\"");

    supabaseState.responses.quotes = {
      data: [
        {
          id: "quote-1",
          status: "draft",
          total: 120,
          created_at: "2025-01-01T00:00:00.000Z",
          job_id: "job-1",
          client_message_template: null,
          smart_quote_used: false,
        },
      ],
      error: null,
    };

    const populatedMarkup = renderToStaticMarkup(await QuotesPage());
    expect(populatedMarkup.startsWith("<div")).toBe(true);
    expect(populatedMarkup).toContain("hb-shell");
    expect(populatedMarkup).toContain("data-testid=\"quotes-list\"");
  });
});
