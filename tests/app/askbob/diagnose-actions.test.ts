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

import { regenerateDiagnosisAction } from "@/app/(app)/askbob/actions";

const jobRow = {
  id: "job-1",
  workspace_id: "workspace-1",
  customer_id: "customer-1",
  title: "Fix faucet",
  description_raw: "Leaking pipe and low pressure",
};

const versionRow = {
  id: "version-1",
  task: "job.diagnose",
  payload: { ok: true },
  created_at: "2025-01-02T12:00:00Z",
};

const diagnoseResult = {
  sessionId: "session-1",
  responseId: "response-1",
  createdAt: "2025-01-02T12:00:00Z",
  sections: [
    {
      type: "steps",
      title: "Diagnosis",
      items: ["Inspect valve"],
    },
  ],
  materials: [],
  modelLatencyMs: 120,
};

beforeEach(() => {
  vi.clearAllMocks();
  const supabaseState = setupSupabaseMock({
    jobs: { data: [jobRow], error: null },
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
  mockRunAskBobTask.mockResolvedValue(diagnoseResult);
});

describe("regenerateDiagnosisAction", () => {
  it("returns the latest version metadata when regeneration succeeds", async () => {
    const result = await regenerateDiagnosisAction({ jobId: "job-1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.versionId).toBe("version-1");
      expect(result.createdAt).toBe("2025-01-02T12:00:00Z");
      expect(result.response.responseId).toBe("response-1");
    }
    expect(mockRunAskBobTask).toHaveBeenCalledTimes(1);
  });

  it("returns missing_job_context when the job lacks description or title", async () => {
    const supabaseState = setupSupabaseMock({
      jobs: {
        data: [
          {
            ...jobRow,
            title: "Fix",
            description_raw: "",
          },
        ],
        error: null,
      },
    });
    createServerClientMock.mockReturnValue(supabaseState.supabase);

    const result = await regenerateDiagnosisAction({ jobId: "job-1" });

    expect(result).toEqual({
      ok: false,
      code: "missing_job_context",
      message: "Add a job title or description before regenerating diagnosis.",
    });
    expect(mockRunAskBobTask).not.toHaveBeenCalled();
  });

  it("surfaces a failure when AskBob throws", async () => {
    mockRunAskBobTask.mockRejectedValueOnce(new Error("Model error"));

    const result = await regenerateDiagnosisAction({ jobId: "job-1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unknown");
    }
  });
});
