import { describe, expect, it, beforeEach, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockResolveWorkspaceContext = vi.fn();
const mockRunInternalScenarioStep = vi.fn();
const mockGetJobTaskSnapshots = vi.fn();
const mockResolveNextInternalScenario = vi.fn();
vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  resolveWorkspaceContext: () => mockResolveWorkspaceContext(),
}));

vi.mock("@/lib/domain/bobflow/runInternalScenario", () => ({
  runInternalScenarioStep: (...args: unknown[]) => mockRunInternalScenarioStep(...args),
}));

vi.mock("@/lib/domain/askbob/repository", () => ({
  getJobTaskSnapshotsForJob: (...args: unknown[]) => mockGetJobTaskSnapshots(...args),
}));

vi.mock("@/lib/domain/bobflow/resolveNextInternalScenario", () => ({
  resolveNextInternalScenario: (...args: unknown[]) =>
    mockResolveNextInternalScenario(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
}));

import { revalidatePath as mockRevalidatePath } from "next/cache";
import { redirect as mockRedirect } from "next/navigation";

import { runInternalScenarioAction } from "@/app/m/action/page";

describe("runInternalScenarioAction", () => {
  const jobRow = { id: "job-1", workspace_id: "workspace-1" };
  let supabaseState = setupSupabaseMock();

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseState = setupSupabaseMock({
      jobs: { data: [jobRow], error: null },
    });
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockResolveWorkspaceContext.mockResolvedValue({
      ok: true,
      workspaceId: "workspace-1",
      userId: "user-1",
      membership: {
        user: { id: "user-1", email: "owner@example.com", user_metadata: {} },
        workspace: { id: "workspace-1", name: "Workspace", owner_id: "owner-1", slug: "workspace" },
        role: "owner",
      },
    });
    mockRunInternalScenarioStep.mockResolvedValue({
      scenario: "Internal.diagnose",
      task: "job.diagnose",
      executed: true,
      skipped: false,
    });
    mockGetJobTaskSnapshots.mockResolvedValue([]);
    mockResolveNextInternalScenario.mockReturnValue("Internal.diagnose");
  });

  it("runs the runner for Internal.* scenarios", async () => {
    const formData = new FormData();
    formData.set("scenario", "Internal.msg");
    formData.set("jobId", jobRow.id);
    formData.set("workspaceId", "workspace-1");
    formData.set("intent", "move_on");

    await expect(runInternalScenarioAction(formData)).rejects.toThrow("redirect");

    expect(mockRunInternalScenarioStep).toHaveBeenCalledWith({
      supabase: supabaseState.supabase,
      scenario: "Internal.diagnose",
      workspaceId: "workspace-1",
      jobId: "job-1",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/m");
    expect(mockRedirect).toHaveBeenCalledWith(
      "/m?handoff=1&jobId=job-1&scenario=Internal.diagnose&executedScenario=Internal.diagnose&executedTask=job.diagnose&executed=1",
    );
    expect(mockGetJobTaskSnapshots).toHaveBeenCalledWith(supabaseState.supabase, {
      workspaceId: "workspace-1",
      jobId: "job-1",
    });
    expect(mockResolveNextInternalScenario).toHaveBeenCalledWith([]);
  });

  it("skips the runner for non-Internal scenarios", async () => {
    const formData = new FormData();
    formData.set("scenario", "External.msg.notification.delay");
    formData.set("jobId", jobRow.id);
    formData.set("workspaceId", "workspace-1");

    await expect(runInternalScenarioAction(formData)).rejects.toThrow("redirect");

    expect(mockRunInternalScenarioStep).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith("/m");
  });

  it("logs skipped metadata when a usable snapshot already exists", async () => {
    mockRunInternalScenarioStep.mockResolvedValueOnce({
      scenario: "Internal.msg",
      task: "job.followup",
      executed: false,
      skipped: true,
      skipReason: "usable_snapshot_exists",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const formData = new FormData();
      formData.set("scenario", "Internal.msg");
      formData.set("jobId", jobRow.id);
      formData.set("workspaceId", "workspace-1");

      await expect(runInternalScenarioAction(formData)).rejects.toThrow("redirect");

      expect(mockRunInternalScenarioStep).toHaveBeenCalled();
      const logCall = logSpy.mock.calls.find((call) => call[0] === "[mobile-action-run]");
      expect(logCall).toBeTruthy();
      expect(logCall?.[2]).toMatchObject({
        skipped: true,
        skipReason: "usable_snapshot_exists",
        task: "job.followup",
      });
    } finally {
      logSpy.mockRestore();
    }
  });

  it("redirects with completed flag when all Internal.* steps are ready", async () => {
    mockResolveNextInternalScenario.mockReturnValueOnce(null);
    const formData = new FormData();
    formData.set("scenario", "Internal.quotes");
    formData.set("jobId", jobRow.id);
    formData.set("workspaceId", "workspace-1");
    formData.set("intent", "move_on");

    await expect(runInternalScenarioAction(formData)).rejects.toThrow("redirect");

    expect(mockRunInternalScenarioStep).not.toHaveBeenCalled();
    expect(mockGetJobTaskSnapshots).toHaveBeenCalledWith(supabaseState.supabase, {
      workspaceId: "workspace-1",
      jobId: "job-1",
    });
    expect(mockRedirect).toHaveBeenCalledWith(
      "/m?handoff=1&jobId=job-1&scenario=Internal.quotes&executed=0&completed=1",
    );
  });
});
