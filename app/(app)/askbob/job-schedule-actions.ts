"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { formatFriendlyDateTime } from "@/utils/timeline/formatters";
import { recordAskBobJobTaskSnapshot } from "@/lib/domain/askbob/service";
import { AskBobJobScheduleSnapshotPayload } from "@/lib/domain/askbob/types";

import { runAskBobJobScheduleAction as runAskBobJobScheduleActionService } from "./schedule-actions";

export async function runAskBobJobScheduleAction(
  payload: Parameters<typeof runAskBobJobScheduleActionService>[0]
): ReturnType<typeof runAskBobJobScheduleActionService> {
  return runAskBobJobScheduleActionService(payload);
}

const appointmentSchedulePayloadSchema = z.object({
  workspaceId: z.string().min(1),
  jobId: z.string().min(1),
  customerId: z.string().optional().nullable(),
  startAt: z.string().min(1),
  endAt: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
});

type AppointmentSchedulePayload = z.infer<typeof appointmentSchedulePayloadSchema>;

type AppointmentScheduleSuccessResult = {
  ok: true;
  appointmentId: string;
  startAt: string;
  endAt: string;
  title: string;
  friendlyLabel: string | null;
};
type AppointmentScheduleFailureResult = { ok: false; error: string; jobId?: string };
type AppointmentScheduleActionResult =
  | AppointmentScheduleSuccessResult
  | AppointmentScheduleFailureResult;

export async function runAskBobScheduleAppointmentAction(
  payload: AppointmentSchedulePayload
): Promise<AppointmentScheduleActionResult> {
  const parsed = appointmentSchedulePayloadSchema.parse(payload);
  const supabase = await createServerClient();
  const { workspace, user } = await getCurrentWorkspace({ supabase });

  if (!workspace || !user) {
    return { ok: false, error: "workspace_unavailable" };
  }

  if (workspace.id !== parsed.workspaceId) {
    console.error("[askbob-job-schedule-appointment-ui-failure] workspace mismatch", {
      expectedWorkspaceId: workspace.id,
      payloadWorkspaceId: parsed.workspaceId,
      userId: user.id,
      jobId: parsed.jobId,
      isAskBobScheduler: true,
      task: "job.scheduler",
    });
    return { ok: false, error: "wrong_workspace" };
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.jobId)
    .maybeSingle();

  if (!job) {
    console.error("[askbob-job-schedule-appointment-ui-failure] job not found", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: parsed.jobId,
      isAskBobScheduler: true,
      task: "job.scheduler",
    });
    return { ok: false, error: "job_not_found" };
  }

  const startDate = new Date(parsed.startAt);
  if (Number.isNaN(startDate.getTime())) {
    return { ok: false, error: "invalid_start_time" };
  }

  const now = new Date();
  if (startDate.getTime() <= now.getTime()) {
    console.error("[askbob-job-schedule-invalid-time]", {
      workspaceId: workspace.id,
      userId: user.id,
      jobId: job.id,
      requestedStartAt: startDate.toISOString(),
      serverNow: now.toISOString(),
      customerId: parsed.customerId ?? null,
      task: "job.scheduler",
    });
    return { ok: false, error: "start_time_not_in_future", jobId: job.id };
  }

  let endTimeIso: string | null = null;
  if (parsed.endAt) {
    const endDate = new Date(parsed.endAt);
    if (!Number.isNaN(endDate.getTime())) {
      endTimeIso = endDate.toISOString();
    }
  }
  if (!endTimeIso) {
    const fallbackEnd = new Date(startDate);
    fallbackEnd.setMinutes(fallbackEnd.getMinutes() + 60);
    endTimeIso = fallbackEnd.toISOString();
  }

  const title =
    parsed.title?.trim() ||
    (job.title ? `Visit ${job.title.trim()}` : "Visit");

  const insertPayload = {
    user_id: user.id,
    workspace_id: workspace.id,
    job_id: job.id,
    title,
    status: "scheduled",
    notes: "",
    location: "",
    start_time: startDate.toISOString(),
    end_time: endTimeIso,
  };

  console.log("[askbob-job-schedule-appointment-ui-request]", {
    workspaceId: workspace.id,
    userId: user.id,
    customerId: parsed.customerId ?? null,
    jobId: job.id,
    appointmentPayload: {
      startAt: insertPayload.start_time,
      endAt: insertPayload.end_time,
      title,
    },
    isAskBobScheduler: true,
    task: "job.scheduler",
  });

  const { data, error } = await supabase
    .from("appointments")
    .insert(insertPayload)
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    console.error("[askbob-job-schedule-appointment-ui] Failed to create appointment", {
      error,
      payload: insertPayload,
      customerId: parsed.customerId ?? null,
      isAskBobScheduler: true,
      task: "job.scheduler",
    });
    return { ok: false, error: "create_failed", jobId: job.id };
  }

  const appointmentId = data.id;
  const startIso = startDate.toISOString();
  const friendlyLabelCandidate = formatFriendlyDateTime(startIso, "");
  const friendlyLabel =
    friendlyLabelCandidate?.trim() && friendlyLabelCandidate.length ? friendlyLabelCandidate : null;
  const snapshotPayload: AskBobJobScheduleSnapshotPayload = {
    appointmentId,
    startAt: startIso,
    endAt: endTimeIso,
    friendlyLabel,
  };
  try {
    await recordAskBobJobTaskSnapshot(supabase, {
      workspaceId: workspace.id,
      jobId: job.id,
      task: "job.schedule",
      result: snapshotPayload,
    });
  } catch (snapshotError) {
    console.error("[askbob-job-schedule-appointment-ui] Failed to record appointment snapshot", snapshotError);
  }

  revalidatePath("/appointments");
  revalidatePath(`/jobs/${job.id}`);

  console.log("[askbob-job-schedule-appointment-ui-success]", {
    workspaceId: workspace.id,
    userId: user.id,
    customerId: parsed.customerId ?? null,
    jobId: job.id,
    appointmentId,
    startAt: startIso,
    endAt: endTimeIso,
    title,
    isAskBobScheduler: true,
    task: "job.scheduler",
  });

  return {
    ok: true,
    appointmentId,
    startAt: startIso,
    endAt: endTimeIso,
    title,
    friendlyLabel,
  };
}
