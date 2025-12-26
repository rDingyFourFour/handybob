import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import { mapWorkspaceResultToRouteOutcome, resolveWorkspaceContext } from "@/lib/domain/workspaces";

const createServerClientMock = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

describe("resolveWorkspaceContext", () => {
  beforeEach(() => {
    createServerClientMock.mockReset();
  });

  it("returns unauthenticated when the user is missing", async () => {
    const supabaseState = setupSupabaseMock({
      workspace_members: { data: [], error: null },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    };
    createServerClientMock.mockReturnValue(supabaseState.supabase);

    const result = await resolveWorkspaceContext({ allowAutoCreateWorkspace: false });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unauthenticated");
    }
  });

  it("returns no_membership when membership is missing", async () => {
    const supabaseState = setupSupabaseMock({
      workspace_members: { data: [], error: null },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    };
    createServerClientMock.mockReturnValue(supabaseState.supabase);

    const result = await resolveWorkspaceContext({ allowAutoCreateWorkspace: false });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("no_membership");
    }
  });

  it("returns workspace metadata on success", async () => {
    const supabaseState = setupSupabaseMock({
      workspace_members: {
        data: [
          {
            role: "owner",
            workspace: { id: "workspace-1", name: "Test", owner_id: "user-1", slug: "test" },
          },
        ],
        error: null,
      },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    };
    createServerClientMock.mockReturnValue(supabaseState.supabase);

    const result = await resolveWorkspaceContext({ allowAutoCreateWorkspace: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.workspaceId).toBe("workspace-1");
      expect(result.userId).toBe("user-1");
      expect(result.membership.role).toBe("owner");
      expect(result.membership.workspace.id).toBe("workspace-1");
    }
  });
});

describe("mapWorkspaceResultToRouteOutcome", () => {
  it("suggests redirect for unauthenticated", () => {
    const outcome = mapWorkspaceResultToRouteOutcome({
      ok: false,
      code: "unauthenticated",
    });
    expect(outcome?.redirectToLogin).toBe(true);
    expect(outcome?.showAccessDenied).toBe(false);
  });

  it("suggests access denied for no membership", () => {
    const outcome = mapWorkspaceResultToRouteOutcome({
      ok: false,
      code: "no_membership",
    });
    expect(outcome?.redirectToLogin).toBe(false);
    expect(outcome?.showAccessDenied).toBe(true);
  });
});
