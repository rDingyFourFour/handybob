import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const materialRunnerMock = vi.fn();
const quoteRunnerMock = vi.fn();
vi.mock("@/lib/domain/askbob/repository", () => ({
  getLatestJobTaskSnapshotVersion: vi.fn(),
}));
vi.mock("@/app/(app)/askbob/materials-actions", () => ({
  regenerateAskBobMaterialsAction: (...args: unknown[]) => materialRunnerMock(...args),
}));
vi.mock("@/app/(app)/askbob/quote-actions", () => ({
  regenerateAskBobQuoteAction: (...args: unknown[]) => quoteRunnerMock(...args),
}));
vi.mock("@/app/(app)/askbob/followup-actions", () => ({
  runAskBobJobFollowupAction: vi.fn(),
}));

import { getLatestJobTaskSnapshotVersion } from "@/lib/domain/askbob/repository";
import { runAskBobJobFollowupAction } from "@/app/(app)/askbob/followup-actions";
import { runInternalScenarioStep } from "@/lib/domain/bobflow/runInternalScenario";

const getLatestMock = vi.mocked(getLatestJobTaskSnapshotVersion);
const runAskBobMock = vi.mocked(runAskBobJobFollowupAction);
const materialRunMock = vi.mocked(materialRunnerMock);
const quoteRunMock = vi.mocked(quoteRunnerMock);

describe("runInternalScenarioStep", () => {
  const supabase = {} as SupabaseClient;
  const baseArgs = {
    supabase,
    workspaceId: "workspace-test",
    jobId: "job-test",
  } as const;
  const msgArgs = { ...baseArgs, scenario: "Internal.msg" as const };
  const materialsArgs = { ...baseArgs, scenario: "Internal.materials" as const };
  const quotesArgs = { ...baseArgs, scenario: "Internal.quotes" as const };

  beforeEach(() => {
    getLatestMock.mockReset();
    runAskBobMock.mockReset();
    materialRunMock.mockReset();
    quoteRunMock.mockReset();
    getLatestMock.mockResolvedValue(null);
    runAskBobMock.mockResolvedValue(undefined);
    materialRunMock.mockResolvedValue(undefined);
    quoteRunMock.mockResolvedValue(undefined);
  });

  it("skips the runner when a usable snapshot already exists", async () => {
    getLatestMock.mockResolvedValueOnce({
      id: "snapshot-1",
      task: "job.followup",
      payload: { recommendedAction: "Follow up", steps: [] },
      created_at: "2024-01-01T00:00:00Z",
    });

    const result = await runInternalScenarioStep(msgArgs);

    expect(result).toEqual({
      scenario: "Internal.msg",
      task: "job.followup",
      executed: false,
      skipped: true,
      skipReason: "usable_snapshot_exists",
    });
    expect(runAskBobMock).not.toHaveBeenCalled();
  });

  it("executes the runner when no snapshot exists", async () => {
    const result = await runInternalScenarioStep(msgArgs);

    expect(result).toEqual({
      scenario: "Internal.msg",
      task: "job.followup",
      executed: true,
      skipped: false,
    });
    expect(runAskBobMock).toHaveBeenCalledWith({
      workspaceId: "workspace-test",
      jobId: "job-test",
    });
  });

  it("runs the materials runner when no snapshot exists", async () => {
    const result = await runInternalScenarioStep(materialsArgs);

    expect(result).toEqual({
      scenario: "Internal.materials",
      task: "materials.generate",
      executed: true,
      skipped: false,
    });
    expect(materialRunMock).toHaveBeenCalledWith({
      jobId: "job-test",
    });
  });

  it("runs the quote runner when no snapshot exists", async () => {
    const result = await runInternalScenarioStep(quotesArgs);

    expect(result).toEqual({
      scenario: "Internal.quotes",
      task: "quote.generate",
      executed: true,
      skipped: false,
    });
    expect(quoteRunMock).toHaveBeenCalledWith({
      jobId: "job-test",
    });
  });

  it("skips the quote runner when a usable snapshot already exists", async () => {
    getLatestMock.mockResolvedValueOnce({
      id: "snapshot-quote",
      task: "quote.generate",
      payload: { lines: [{ description: "", quantity: 1 }] },
      created_at: "2024-01-01T00:00:00Z",
    });

    const result = await runInternalScenarioStep(quotesArgs);

    expect(result).toEqual({
      scenario: "Internal.quotes",
      task: "quote.generate",
      executed: false,
      skipped: true,
      skipReason: "usable_snapshot_exists",
    });
    expect(quoteRunMock).not.toHaveBeenCalled();
  });
});
