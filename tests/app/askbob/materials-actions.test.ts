import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockResolveWorkspaceContext = vi.fn();
const mockRunAskBobTask = vi.fn();

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

vi.mock("@/lib/domain/askbob/service", () => ({
  runAskBobTask: (...args: unknown[]) => mockRunAskBobTask(...args),
}));

import { regenerateAskBobMaterialsAction } from "@/app/(app)/askbob/materials-actions";

const jobRow = {
  id: "job-1",
  workspace_id: "workspace-1",
  customer_id: "customer-1",
  title: "Fix faucet",
  description_raw: "Leaking pipe and low pressure",
};

const versionRow = {
  id: "version-1",
  task: "materials.generate",
  payload: { ok: true },
  created_at: "2025-01-02T12:00:00Z",
};

const materialsResult = {
  items: [
    {
      name: "Copper pipe",
      quantity: 2,
      unit: "pcs",
      estimatedUnitCost: 12,
      estimatedTotalCost: 24,
    },
  ],
  notes: "Check size",
  modelLatencyMs: 140,
  rawModelOutput: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  const supabaseState = setupSupabaseMock({
    jobs: { data: [jobRow], error: null },
    askbob_job_task_snapshots: { data: [], error: null },
    askbob_job_task_snapshot_versions: { data: [versionRow], error: null },
  });
  createServerClientMock.mockReturnValue(supabaseState.supabase);
  mockResolveWorkspaceContext.mockResolvedValue({
    ok: true,
    membership: {
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
      role: "owner",
    },
  });
  mockRunAskBobTask.mockResolvedValue(materialsResult);
});

describe("regenerateAskBobMaterialsAction", () => {
  it("returns the latest version metadata when regeneration succeeds", async () => {
    const result = await regenerateAskBobMaterialsAction({ jobId: "job-1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.versionId).toBe("version-1");
      expect(result.createdAt).toBe("2025-01-02T12:00:00Z");
      expect(result.suggestion.materials?.[0]?.name).toBe("Copper pipe");
    }
    expect(mockRunAskBobTask).toHaveBeenCalledTimes(1);
  });

  it("returns an error when AskBob fails", async () => {
    mockRunAskBobTask.mockRejectedValueOnce(new Error("Model error"));

    const result = await regenerateAskBobMaterialsAction({ jobId: "job-1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unknown");
    }
  });
});
