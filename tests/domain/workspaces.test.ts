import { describe, expect, it } from "vitest";

import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

describe("getCurrentWorkspace", () => {
  it("returns unauthenticated without redirecting", async () => {
    const supabaseState = setupSupabaseMock();
    supabaseState.supabase.auth = {
      getUser: async () => ({ data: { user: null } }),
    } as typeof supabaseState.supabase.auth;

    const result = await getCurrentWorkspace({
      supabase: supabaseState.supabase,
      allowAutoCreateWorkspace: false,
    });

    expect(result.workspace).toBeNull();
    expect(result.reason).toBe("unauthenticated");
  });
});
