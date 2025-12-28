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

import { openOrCreateCallSessionForJobAction } from "@/app/(app)/jobs/actions/openOrCreateCallSessionForJobAction";

describe("openOrCreateCallSessionForJobAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reuses the latest non-terminal call session", async () => {
    const supabaseState = setupSupabaseMock({
      jobs: {
        data: [
          {
            id: "job-1",
            customer_id: "customer-1",
            customers: [{ phone: "+15550002222" }],
          },
        ],
        error: null,
      },
      calls: {
        data: [
          {
            id: "call-1",
            twilio_status: null,
            created_at: "2024-01-01T12:00:00.000Z",
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

    const result = await openOrCreateCallSessionForJobAction({ jobId: "job-1" });

    expect(result).toEqual({ ok: true, callId: "call-1" });
    expect(supabaseState.queries.calls.insert).not.toHaveBeenCalled();
  });

  it("creates a new call session when none exist", async () => {
    const supabaseState = setupSupabaseMock({
      jobs: {
        data: [
          {
            id: "job-1",
            customer_id: "customer-1",
            customers: [{ phone: "+15550002222" }],
          },
        ],
        error: null,
      },
      workspaces: {
        data: [{ business_phone: "+15550001111" }],
        error: null,
      },
      calls: [
        { data: [], error: null },
        {
          data: [
            {
              id: "call-new",
              workspace_id: "workspace-1",
              job_id: "job-1",
            },
          ],
          error: null,
        },
      ],
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

    const result = await openOrCreateCallSessionForJobAction({ jobId: "job-1" });

    expect(result).toEqual({ ok: true, callId: "call-new" });
    expect(supabaseState.queries.calls.insert).toHaveBeenCalled();
  });

  it("returns a workspace guard failure when context is missing", async () => {
    const supabaseState = setupSupabaseMock();
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: false,
      code: "unauthenticated",
    });

    const result = await openOrCreateCallSessionForJobAction({ jobId: "job-1" });

    expect(result).toEqual({
      ok: false,
      code: "unauthenticated",
      message: "We couldn’t verify your workspace session.",
    });
  });

  it("returns a job-not-found failure", async () => {
    const supabaseState = setupSupabaseMock({
      jobs: { data: [], error: null },
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

    const result = await openOrCreateCallSessionForJobAction({ jobId: "job-1" });

    expect(result).toEqual({
      ok: false,
      code: "job_not_found",
      message: "We couldn’t find that job.",
    });
  });
});
