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
    resolveWorkspaceContext: (...args: unknown[]) => mockResolveWorkspaceContext(...args),
  };
});

import { updatePublicBookingEnabledAction } from "@/app/(app)/settings/actions/updatePublicBookingEnabledAction";

describe("updatePublicBookingEnabledAction", () => {
  let supabaseState = setupSupabaseMock();

  beforeEach(() => {
    supabaseState = setupSupabaseMock();
    createServerClientMock.mockReset();
    mockResolveWorkspaceContext.mockReset();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("updates the public booking setting for owners", async () => {
    supabaseState.responses.workspaces = [
      { data: [{ public_lead_form_enabled: false }], error: null },
      { data: [{ public_lead_form_enabled: true }], error: null },
    ];
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: true,
      workspaceId: "workspace-1",
      userId: "user-1",
      membership: {
        user: { id: "user-1" },
        workspace: { id: "workspace-1", name: "Test workspace", owner_id: "user-1" },
        role: "owner",
      },
    });

    const result = await updatePublicBookingEnabledAction({ enabled: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.enabled).toBe(true);
    }

    const logCalls = vi.mocked(console.log).mock.calls;
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[settings-booking-toggle-success]" &&
          payload.workspaceId === "workspace-1" &&
          payload.userId === "user-1" &&
          payload.enabled === true,
      ),
    ).toBe(true);
  });

  it("returns success without updates when already in the requested state", async () => {
    supabaseState.responses.workspaces = [
      { data: [{ public_lead_form_enabled: true }], error: null },
    ];
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: true,
      workspaceId: "workspace-1",
      userId: "user-1",
      membership: {
        user: { id: "user-1" },
        workspace: { id: "workspace-1", name: "Test workspace", owner_id: "user-1" },
        role: "owner",
      },
    });

    const result = await updatePublicBookingEnabledAction({ enabled: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.enabled).toBe(true);
    }

    const logCalls = vi.mocked(console.log).mock.calls;
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[settings-booking-toggle-success]" &&
          payload.workspaceId === "workspace-1" &&
          payload.noChange === true,
      ),
    ).toBe(true);
  });

  it("returns unauthenticated failure when no workspace context exists", async () => {
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: false,
      code: "unauthenticated",
      user: null,
    });

    const result = await updatePublicBookingEnabledAction({ enabled: false });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("unauthenticated");
    }

    const warnCalls = vi.mocked(console.warn).mock.calls;
    expect(
      warnCalls.some(
        ([label, payload]) =>
          label === "[settings-booking-toggle-failure]" && payload.errorCode === "unauthenticated",
      ),
    ).toBe(true);
  });

  it("returns a workspace failure when updates cannot find the workspace", async () => {
    supabaseState.responses.workspaces = [
      { data: [{ public_lead_form_enabled: false }], error: null },
      { data: null, error: null },
    ];
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: true,
      workspaceId: "workspace-1",
      userId: "user-1",
      membership: {
        user: { id: "user-1" },
        workspace: { id: "workspace-1", name: "Test workspace", owner_id: "user-1" },
        role: "owner",
      },
    });

    const result = await updatePublicBookingEnabledAction({ enabled: true });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("workspace_not_found");
    }

    const warnCalls = vi.mocked(console.warn).mock.calls;
    expect(
      warnCalls.some(
        ([label, payload]) =>
          label === "[settings-booking-toggle-failure]" &&
          payload.errorCode === "workspace_not_found",
      ),
    ).toBe(true);
  });

  it("emits telemetry without raw error objects", async () => {
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: false,
      code: "no_membership",
      user: { id: "user-1" },
    });

    await updatePublicBookingEnabledAction({ enabled: false });

    const telemetryPayloads = [
      ...vi.mocked(console.log).mock.calls,
      ...vi.mocked(console.warn).mock.calls,
    ]
      .map(([, payload]) => payload)
      .filter(Boolean);

    expect(
      telemetryPayloads.every((payload) =>
        Object.values(payload as Record<string, unknown>).every(
          (value) => !(value instanceof Error),
        ),
      ),
    ).toBe(true);
  });
});
