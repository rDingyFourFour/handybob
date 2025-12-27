import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain/workspaces")>(
    "@/lib/domain/workspaces",
  );
  return {
    ...actual,
    getCurrentWorkspace: () => mockGetCurrentWorkspace(),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { updatePublicBookingStatus } from "@/app/(app)/settings/publicBookingActions";

describe("updatePublicBookingStatus", () => {
  let supabaseState = setupSupabaseMock();

  beforeEach(() => {
    supabaseState = setupSupabaseMock();
    createServerClientMock.mockReset();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockReset();
  });

  function buildFormData(enabled: boolean) {
    const formData = new FormData();
    formData.set("enabled", String(enabled));
    return formData;
  }

  it("updates the public booking setting for owners", async () => {
    supabaseState.responses.workspaces = [
      { data: [{ public_lead_form_enabled: true }], error: null },
    ];
    mockGetCurrentWorkspace.mockResolvedValue({
      user: { id: "user-1" },
      workspace: { id: "workspace-1", name: "Test workspace", owner_id: "user-1" },
      role: "owner",
    });

    const result = await updatePublicBookingStatus(
      { status: "idle", enabled: false, message: null, code: null },
      buildFormData(true),
    );

    expect(result.status).toBe("success");
    expect(result.enabled).toBe(true);
  });

  it("rejects non-owner attempts", async () => {
    mockGetCurrentWorkspace.mockResolvedValue({
      user: { id: "user-1" },
      workspace: { id: "workspace-1", name: "Test workspace", owner_id: "user-1" },
      role: "staff",
    });

    const result = await updatePublicBookingStatus(
      { status: "idle", enabled: true, message: null, code: null },
      buildFormData(false),
    );

    expect(result.status).toBe("error");
    expect(result.code).toBe("unauthorized");
  });
});
