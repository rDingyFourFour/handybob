import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/domain/askbob/repository", () => ({
  getLatestJobTaskSnapshotVersion: vi.fn(),
}));
vi.mock("@/app/(app)/askbob/followup-actions", () => ({
  runAskBobJobFollowupAction: vi.fn(),
}));

import { getLatestJobTaskSnapshotVersion } from "@/lib/domain/askbob/repository";
import { runAskBobJobFollowupAction } from "@/app/(app)/askbob/followup-actions";
import { runInternalScenarioStep } from "@/lib/domain/bobflow/runInternalScenario";

const getLatestMock = vi.mocked(getLatestJobTaskSnapshotVersion);
const runAskBobMock = vi.mocked(runAskBobJobFollowupAction);

describe("runInternalScenarioStep", () => {
  const supabase = {} as SupabaseClient;
  const args = {
    supabase,
    scenario: "Internal.msg",
    workspaceId: "workspace-test",
    jobId: "job-test",
  } as const;

  beforeEach(() => {
    getLatestMock.mockReset();
    runAskBobMock.mockReset();
    getLatestMock.mockResolvedValue(null);
    runAskBobMock.mockResolvedValue(undefined);
  });

  it("skips the runner when a usable snapshot already exists", async () => {
    getLatestMock.mockResolvedValueOnce({
      id: "snapshot-1",
      task: "job.followup",
      payload: { recommendedAction: "Follow up", steps: [] },
      created_at: "2024-01-01T00:00:00Z",
    });

    const result = await runInternalScenarioStep(args);

    expect(result).toEqual({
      task: "job.followup",
      executed: false,
      skipReason: "snapshot_exists",
    });
    expect(runAskBobMock).not.toHaveBeenCalled();
  });

  it("executes the runner when no snapshot exists", async () => {
    const result = await runInternalScenarioStep(args);

    expect(result).toEqual({
      task: "job.followup",
      executed: true,
    });
    expect(runAskBobMock).toHaveBeenCalledWith({
      workspaceId: "workspace-test",
      jobId: "job-test",
    });
  });
});
