import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

vi.mock("next/navigation", () => ({
  redirect: (value: string) => {
    const error = new Error(value);
    (error as Record<string, unknown>).location = value;
    throw error;
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const createServerClientMock = vi.fn();
vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

const resolveWorkspaceContextMock = vi.fn();
vi.mock("@/lib/domain/workspaces", () => ({
  resolveWorkspaceContext: () => resolveWorkspaceContextMock(),
}));

const getJobTaskSnapshotsMock = vi.fn();
vi.mock("@/lib/domain/askbob/repository", () => ({
  getJobTaskSnapshotsForJob: (...args: unknown[]) => getJobTaskSnapshotsMock(...args),
}));

const resolveNextInternalScenarioMock = vi.fn();
vi.mock("@/lib/domain/bobflow/resolveNextInternalScenario", () => ({
  resolveNextInternalScenario: (...args: unknown[]) => resolveNextInternalScenarioMock(...args),
}));

const runInternalScenarioStepMock = vi.fn();
vi.mock("@/lib/domain/bobflow/runInternalScenario", () => ({
  runInternalScenarioStep: (...args: unknown[]) => runInternalScenarioStepMock(...args),
}));

import { runInternalScenarioAction } from "@/app/m/action/page";

describe("runInternalScenarioAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the computed Internal scenario when move_on intent is provided", async () => {
    const supabaseState = setupSupabaseMock({
      jobs: {
        data: [
          {
            id: "job-1",
            workspace_id: "workspace-test",
          },
        ],
        error: null,
      },
    });
    createServerClientMock.mockReturnValue(supabaseState.supabase);
    resolveWorkspaceContextMock.mockResolvedValue({
      ok: true,
      membership: {
        workspace: { id: "workspace-test" },
        user: { id: "user-1" },
        role: "owner",
      },
    });
    getJobTaskSnapshotsMock.mockResolvedValue([]);
    resolveNextInternalScenarioMock.mockReturnValue("Internal.diagnose");
    runInternalScenarioStepMock.mockResolvedValue({
      scenario: "Internal.diagnose",
      task: "job.diagnose",
      executed: true,
      skipped: false,
    });

    const formData = new FormData();
    formData.set("scenario", "Internal.msg");
    formData.set("jobId", "job-1");
    formData.set("workspaceId", "workspace-test");
    formData.set("intent", "move_on");

    const expectedHref =
      "/m?handoff=1&jobId=job-1&scenario=Internal.diagnose&executedScenario=Internal.diagnose&executedTask=job.diagnose&executed=1";

    await expect(runInternalScenarioAction(formData)).rejects.toThrow(expectedHref);

    expect(getJobTaskSnapshotsMock).toHaveBeenCalledWith(supabaseState.supabase, {
      workspaceId: "workspace-test",
      jobId: "job-1",
    });
    expect(resolveNextInternalScenarioMock).toHaveBeenCalledWith([]);
    expect(runInternalScenarioStepMock).toHaveBeenCalledWith({
      supabase: supabaseState.supabase,
      scenario: "Internal.diagnose",
      workspaceId: "workspace-test",
      jobId: "job-1",
    });
  });
});
