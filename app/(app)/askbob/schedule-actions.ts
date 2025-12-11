"use server";

import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { runAskBobTask } from "@/lib/domain/askbob/service";
import {
  AskBobDiagnoseSnapshotPayload,
  AskBobFollowupSnapshotPayload,
  AskBobJobScheduleInput,
  AskBobJobScheduleResult,
  AskBobJobTaskSnapshotTask,
  AskBobMaterialsSnapshotPayload,
  AskBobQuoteSnapshotPayload,
  AskBobSchedulerSlot,
} from "@/lib/domain/askbob/types";
import { getJobTaskSnapshotsForJob } from "@/lib/domain/askbob/repository";
import {
  buildDiagnosisSummaryFromSnapshot,
  buildFollowupSummaryFromSnapshot,
  buildMaterialsSummaryFromSnapshot,
  buildQuoteSummaryFromSnapshot,
} from "@/lib/domain/askbob/summary";

const schedulerPayloadSchema = z.object({
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  prompt: z.string().optional().nullable(),
  technicianNotes: z.string().optional().nullable(),
});

type SchedulerPayload = z.infer<typeof schedulerPayloadSchema>;

type SchedulerSuccessResult = {
  ok: true;
  jobId: string;
  schedulerResult: {
    slots: AskBobSchedulerSlot[];
    rationale?: string | null;
    safetyNotes?: string | null;
    confirmWithCustomerNotes?: string | null;
  };
  modelLatencyMs: number;
};

type SchedulerFailureResult = {
  ok: false;
  error: string;
  jobId?: string;
};

export type SchedulerActionResult = SchedulerSuccessResult | SchedulerFailureResult;

function normalizeOptionalString(value?: string | null, limit = 400): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed.length) {
    return null;
  }
  return trimmed.length <= limit ? trimmed : trimmed.slice(0, limit);
}

function findSnapshot<T>(
  snapshots: { task: AskBobJobTaskSnapshotTask; payload: unknown }[],
  task: AskBobJobTaskSnapshotTask
): T | null {
  const row = snapshots.find((snapshot) => snapshot.task === task);
  if (!row || !row.payload || typeof row.payload !== "object") {
    return null;
  }
  return row.payload as T;
}

export async function runAskBobJobScheduleAction(
  payload: SchedulerPayload
): Promise<SchedulerActionResult> {
  const parsed = schedulerPayloadSchema.parse(payload);
  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    return { ok: false, error: "workspace_unavailable" };
  }

  if (workspace.id !== parsed.workspaceId) {
    console.error("[askbob-job-schedule-ui-failure] workspace mismatch", {
      expectedWorkspaceId: workspace.id,
      payloadWorkspaceId: parsed.workspaceId,
    });
    return { ok: false, error: "wrong_workspace" };
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, workspace_id, customer_id, description_raw, title")
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.jobId)
    .maybeSingle();

  if (!job) {
    console.error("[askbob-job-schedule-ui-failure] job not found", {
      workspaceId: workspace.id,
      jobId: parsed.jobId,
    });
    return { ok: false, error: "job_not_found" };
  }

  const snapshots = await getJobTaskSnapshotsForJob(supabase, {
    workspaceId: workspace.id,
    jobId: job.id,
  });

  const diagnosisSnapshot = findSnapshot<AskBobDiagnoseSnapshotPayload>(snapshots, "job.diagnose");
  const materialsSnapshot = findSnapshot<AskBobMaterialsSnapshotPayload>(snapshots, "materials.generate");
  const quoteSnapshot = findSnapshot<AskBobQuoteSnapshotPayload>(snapshots, "quote.generate");
  const followupSnapshot = findSnapshot<AskBobFollowupSnapshotPayload>(snapshots, "job.followup");

  const diagnosisSummary = buildDiagnosisSummaryFromSnapshot(diagnosisSnapshot);
  const materialsSummary = buildMaterialsSummaryFromSnapshot(materialsSnapshot);
  const quoteSummary = buildQuoteSummaryFromSnapshot(quoteSnapshot);
  const followupSummary = buildFollowupSummaryFromSnapshot(followupSnapshot);

  const extraDetailsParts: string[] = [];
  const prompt = normalizeOptionalString(parsed.prompt);
  const technicianNotes = normalizeOptionalString(parsed.technicianNotes);
  if (prompt) {
    extraDetailsParts.push(prompt);
  }
  if (technicianNotes) {
    extraDetailsParts.push(technicianNotes);
  }
  const extraDetails = extraDetailsParts.length ? extraDetailsParts.join("\n\n") : undefined;

  const jobTitle = normalizeOptionalString(job.title ?? undefined);
  const jobDescription = normalizeOptionalString(job.description_raw ?? undefined);
  const now = new Date();
  const nowTimestamp = now.getTime();
  const todayDateIso = now.toISOString().split("T")[0];

  console.log("[askbob-job-schedule-ui-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    jobId: job.id,
    hasDiagnosisContext: Boolean(diagnosisSummary),
    hasMaterialsContext: Boolean(materialsSummary),
    hasQuoteContext: Boolean(quoteSummary),
    hasFollowupContext: Boolean(followupSummary),
    hasExtraDetails: Boolean(extraDetails),
    todayDateIso,
  });

  const schedulerInput: AskBobJobScheduleInput = {
    task: "job.schedule",
    context: {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      customerId: job.customer_id ?? null,
    },
    jobTitle,
    jobDescription,
    diagnosisSummary,
    materialsSummary,
    quoteSummary,
    followupSummary,
    extraDetails,
    todayDateIso,
    nowTimestamp,
  };

  try {
    const result = await runAskBobTask(supabase, schedulerInput);
    const rawSlots = result.slots;
    const futureSlots = rawSlots.filter((slot) => {
      const startTime = new Date(slot.startAt).getTime();
      return Number.isFinite(startTime) && startTime > nowTimestamp;
    });
    if (!futureSlots.length && rawSlots.length) {
      console.warn("[askbob-job-schedule-filtered-past-slots]", {
        workspaceId: workspace.id,
        userId: user.id,
        jobId: job.id,
        rawCount: rawSlots.length,
        filteredCount: futureSlots.length,
        todayDateIso,
        nowTimestamp,
      });
    }
    const filteredResult: AskBobJobScheduleResult = {
      ...result,
      slots: futureSlots,
    };

    console.log("[askbob-job-schedule-ui-success]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      proposedSlotsCount: filteredResult.slots.length,
      modelLatencyMs: filteredResult.modelLatencyMs,
    });

    return {
      ok: true,
      jobId: job.id,
      schedulerResult: {
        slots: filteredResult.slots,
        rationale: filteredResult.rationale ?? null,
        safetyNotes: filteredResult.safetyNotes ?? null,
        confirmWithCustomerNotes: filteredResult.confirmWithCustomerNotes ?? null,
      },
      modelLatencyMs: filteredResult.modelLatencyMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const truncatedError =
      errorMessage.length <= 200 ? errorMessage : `${errorMessage.slice(0, 197)}...`;
    console.error("[askbob-job-schedule-ui-failure]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      errorMessage: truncatedError,
    });
    return { ok: false, error: "askbob_job_schedule_failed", jobId: job.id };
  }
}
