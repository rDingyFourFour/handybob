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

vi.mock("@/app/(app)/messages/InlineComposer", () => ({
  __esModule: true,
  MessagesWithInlineReplies: () => <div>MessagesWithInlineReplies mock</div>,
  TopLevelComposer: () => <div>TopLevelComposer mock</div>,
}));

vi.mock("@/app/(app)/messages/MessagesHeaderActions", () => ({
  __esModule: true,
  default: () => <div>MessagesHeaderActions mock</div>,
}));

import MessagesPage from "@/app/(app)/messages/page";

describe("MessagesPage", () => {
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

    await MessagesPage({ searchParams: Promise.resolve({}) });

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
      await MessagesPage({ searchParams: Promise.resolve({}) }),
    );

    expect(markup).toContain("Access denied");
  });

  it("renders the message shell when authorized", async () => {
    const supabaseState = setupSupabaseMock();
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
      await MessagesPage({ searchParams: Promise.resolve({}) }),
    );

    expect(markup).toContain("hb-shell");
    expect(markup).toContain("No messages yet");
  });
});
