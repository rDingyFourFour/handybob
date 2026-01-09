import { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { getLatestJobTaskSnapshotVersion } from "@/lib/domain/askbob/repository";
import { AskBobJobTaskSnapshotTask } from "@/lib/domain/askbob/types";
import type { BobFlowScenario } from "@/lib/domain/bobflow/bobFlowScenario";
import {
  internalRunnerRegistry,
  type InternalProgressScenario,
  type InternalRunnerInvocationArgs,
} from "@/lib/domain/bobflow/runnerRegistry";
import {
  isUsableDiagnoseSnapshot,
  isUsableMaterialsSnapshot,
  isUsableQuoteSnapshot,
} from "@/lib/domain/bobflow/resolveNextInternalScenario";
import { isUsableFollowupSnapshot } from "@/lib/domain/bobflow/deriveNextScenarioFromFollowupSnapshot";

export type RunInternalScenarioResult = {
  scenario: InternalProgressScenario;
  task: AskBobJobTaskSnapshotTask;
  executed: boolean;
  skipped: boolean;
  skipReason?: "usable_snapshot_exists";
};

/**
 * Internal.* work is driven by AskBob's canonical runner (`runAskBobTask`) and
 * the job-step wrappers that ultimately call it. This helper keeps `/m/action`
 * focused on wiring inputs to those existing entry points rather than recreating
 * the pipeline.
 */
export type RunInternalScenarioArgs = {
  supabase: SupabaseClient<Database>;
  scenario: BobFlowScenario;
  workspaceId: string;
  jobId: string;
};

export async function runInternalScenarioStep(
  params: RunInternalScenarioArgs,
): Promise<RunInternalScenarioResult> {
  const scenarioKey = params.scenario as InternalProgressScenario;
  const entry = internalRunnerRegistry[scenarioKey];
  if (!entry) {
    throw new Error(`Unsupported internal scenario ${params.scenario}`);
  }

  const task = entry.task;
  const latestSnapshot = await getLatestJobTaskSnapshotVersion(params.supabase, {
    workspaceId: params.workspaceId,
    jobId: params.jobId,
    task,
  });

  const hasUsableSnapshot =
    latestSnapshot && isSnapshotUsableForTask(task, latestSnapshot.payload);

  if (hasUsableSnapshot) {
    return {
      scenario: scenarioKey,
      task,
      executed: false,
      skipped: true,
      skipReason: "usable_snapshot_exists",
    };
  }

  const payload = entry.buildPayload({
    workspaceId: params.workspaceId,
    jobId: params.jobId,
  } satisfies InternalRunnerInvocationArgs);
  await entry.runner(payload);

  return {
    scenario: scenarioKey,
    task,
    executed: true,
    skipped: false,
  };
}

const isSnapshotUsableForTask = (task: AskBobJobTaskSnapshotTask, payload: unknown): boolean => {
  switch (task) {
    case "job.diagnose":
      return isUsableDiagnoseSnapshot(payload);
    case "materials.generate":
      return isUsableMaterialsSnapshot(payload);
    case "quote.generate":
      return isUsableQuoteSnapshot(payload);
    case "job.followup":
      return isUsableFollowupSnapshot(payload);
    default:
      return false;
  }
};
