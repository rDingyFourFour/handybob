import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";
import { resolveWorkspaceContext } from "@/lib/domain/workspaces";
import {
  bobFlowScenarioList,
  isInternalScenario,
  type BobFlowScenario,
} from "@/lib/domain/bobflow/bobFlowScenario";
import { getJobTaskSnapshotsForJob } from "@/lib/domain/askbob/repository";
import { runInternalScenarioStep } from "@/lib/domain/bobflow/runInternalScenario";
import { resolveNextInternalScenario } from "@/lib/domain/bobflow/resolveNextInternalScenario";
import type { RunInternalScenarioResult } from "@/lib/domain/bobflow/runInternalScenario";

const normalizeSearchParam = (value?: string | string[] | null): string | null => {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0]?.trim() || null : value.trim() || null;
};

const isKnownScenario = (value?: string | null): value is BobFlowScenario =>
  typeof value === "string" && bobFlowScenarioList.includes(value as BobFlowScenario);

const buildAssertionLog = (scenario: string, intent: string | null) => ({
  scenario,
  intent,
});

export async function runInternalScenarioAction(formData: FormData) {
  "use server";
  const scenarioParam = normalizeSearchParam(formData.get("scenario") as string | string[] | undefined);
  const jobId = normalizeSearchParam(formData.get("jobId") as string | string[] | undefined);
  const workspaceId = normalizeSearchParam(
    formData.get("workspaceId") as string | string[] | undefined,
  );
  const intent = normalizeSearchParam(formData.get("intent") as string | string[] | undefined);

  if (!scenarioParam || !jobId || !workspaceId || !isKnownScenario(scenarioParam)) {
    return redirect("/m");
  }

  if (!isInternalScenario(scenarioParam)) {
    return redirect("/m");
  }

  const validatedScenario = scenarioParam as BobFlowScenario;
  const isMoveOnIntent = intent === "move_on";

  const supabase = await createServerClient();
  const workspaceResult = await resolveWorkspaceContext({
    supabase,
    allowAutoCreateWorkspace: false,
  });

  if (!workspaceResult.ok) {
    console.error("[mobile-action] workspace not resolved", workspaceResult);
    revalidatePath("/m");
    return redirect("/m");
  }

  const { membership } = workspaceResult;
  const currentWorkspaceId = membership.workspace.id;

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, workspace_id")
    .eq("id", jobId)
    .eq("workspace_id", currentWorkspaceId)
    .maybeSingle();

  if (jobError || !job) {
    console.error("[mobile-action] job not found", { jobId, workspaceId: currentWorkspaceId, jobError });
    revalidatePath("/m");
    return redirect("/m");
  }

  let runResult: RunInternalScenarioResult | null = null;
  try {
    if (isMoveOnIntent) {
      const snapshots = await getJobTaskSnapshotsForJob(supabase, {
        workspaceId: currentWorkspaceId,
        jobId: job.id,
      });
      const nextScenario = resolveNextInternalScenario(snapshots);
      runResult = await runInternalScenarioStep({
        supabase,
        scenario: nextScenario,
        workspaceId: currentWorkspaceId,
        jobId: job.id,
      });
    } else {
      runResult = await runInternalScenarioStep({
        supabase,
        scenario: validatedScenario,
        workspaceId: currentWorkspaceId,
        jobId: job.id,
      });
    }
  } catch (error) {
    console.error("[mobile-action] runner failed", {
      scenario: validatedScenario,
      jobId: job.id,
      error,
    });
  } finally {
    const fallbackResult: RunInternalScenarioResult = {
      scenario: validatedScenario,
      task: "job.followup",
      executed: false,
      skipped: true,
    };
    const resultToLog = runResult ?? fallbackResult;
    console.log(
      "[mobile-action-run]",
      buildAssertionLog(validatedScenario, intent),
      {
        jobId: job.id,
        workspaceId: currentWorkspaceId,
        scenario: resultToLog.scenario,
        executed: resultToLog.executed,
        skipped: resultToLog.skipped,
        skipReason: resultToLog.skipReason,
        task: resultToLog.task,
      },
    );
  }

  // Refresh the mobile home cache before sending the user back.
  revalidatePath("/m");
  if (runResult?.executed) {
    const params = new URLSearchParams({
      handoff: "1",
      jobId: job.id,
      scenario: runResult.scenario,
      executedScenario: runResult.scenario,
      executedTask: runResult.task,
      executed: "1",
    });
    return redirect(`/m?${params.toString()}`);
  }
  return redirect("/m");
}
