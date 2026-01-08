import { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { getLatestJobTaskSnapshotVersion } from "@/lib/domain/askbob/repository";
import { AskBobJobTaskSnapshotTask } from "@/lib/domain/askbob/types";
import type { BobFlowScenario } from "@/lib/domain/bobflow/bobFlowScenario";
import { runAskBobJobFollowupAction } from "@/app/(app)/askbob/followup-actions";
import { isUsableFollowupSnapshot } from "@/lib/domain/bobflow/deriveNextScenarioFromFollowupSnapshot";

const INTERNAL_SCENARIO_TO_TASK: Record<BobFlowScenario, AskBobJobTaskSnapshotTask> = {
  "Internal.msg": "job.followup",
} as const;

export type RunInternalScenarioResult = {
  task: AskBobJobTaskSnapshotTask;
  executed: boolean;
  skipReason?: string;
};

/**
 * Internal.* work is driven by AskBob's canonical runner (`runAskBobTask`) and
 * the job-step wrappers that ultimately call it (e.g. `runAskBobJobFollowupAction`).
 * This helper keeps `/m/action` focused on wiring inputs to those existing entry
 * points rather than recreating the pipeline.
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
  const task = INTERNAL_SCENARIO_TO_TASK[params.scenario];
  if (!task) {
    throw new Error(`Unsupported internal scenario ${params.scenario}`);
  }

  const latestSnapshot = await getLatestJobTaskSnapshotVersion(params.supabase, {
    workspaceId: params.workspaceId,
    jobId: params.jobId,
    task,
  });
  const hasUsableSnapshot =
    latestSnapshot &&
    (task !== "job.followup" || isUsableFollowupSnapshot(latestSnapshot.payload));

  if (hasUsableSnapshot) {
    return { task, executed: false, skipReason: "snapshot_exists" };
  }

  switch (params.scenario) {
    case "Internal.msg":
      await runAskBobJobFollowupAction({
        workspaceId: params.workspaceId,
        jobId: params.jobId,
      });
      break;
    default:
      throw new Error(`No runner configured for ${params.scenario}`);
  }

  return { task, executed: true };
}
