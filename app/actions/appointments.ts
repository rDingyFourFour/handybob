"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";

export async function markAppointmentCompleted(formData: FormData) {
  const supabase = await createServerClient();
  const appointmentId = formData.get("appointmentId");
  if (!appointmentId) return;

  await supabase
    .from("appointments")
    .update({ status: "completed" })
    .eq("id", String(appointmentId));

  revalidatePath("/");
}

export async function createAppointment(formData: FormData) {
  const supabase = await createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  const { workspace, user } = workspaceContext;

  const dateRaw = formData.get("date");
  const startRaw = formData.get("startTime");
  if (typeof dateRaw !== "string" || typeof startRaw !== "string") {
    throw new Error("Date and start time are required.");
  }

  const dateValue = dateRaw.trim();
  const startValue = startRaw.trim();
  if (!dateValue || !startValue) {
    throw new Error("Date and start time are required.");
  }

  const startDate = new Date(`${dateValue}T${startValue}`);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error("Invalid start time.");
  }

  let endTimeIso: string | null = null;
  const endRaw = formData.get("endTime");
  if (typeof endRaw === "string" && endRaw.trim()) {
    const endDate = new Date(`${dateValue}T${endRaw.trim()}`);
    if (!Number.isNaN(endDate.getTime())) {
      endTimeIso = endDate.toISOString();
    }
  }

  if (!endTimeIso) {
    const durationRaw = formData.get("durationMinutes");
    const durationValue =
      typeof durationRaw === "string" && durationRaw.trim() ? Number.parseInt(durationRaw.trim(), 10) : 60;
    const durationMinutes = !Number.isNaN(durationValue) && durationValue > 0 ? durationValue : 60;
    const calculatedEnd = new Date(startDate);
    calculatedEnd.setMinutes(calculatedEnd.getMinutes() + durationMinutes);
    endTimeIso = calculatedEnd.toISOString();
  }

  const jobIdRaw = formData.get("jobId");
  const jobId = typeof jobIdRaw === "string" && jobIdRaw.trim() ? jobIdRaw.trim() : null;
  let jobTitle: string | null = null;
  if (jobId) {
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("title")
      .eq("workspace_id", workspace.id)
      .eq("id", jobId)
      .maybeSingle();
    jobTitle = jobRow?.title ?? null;
  }

  const titleRaw = formData.get("title");
  const title =
    typeof titleRaw === "string" && titleRaw.trim()
      ? titleRaw.trim()
      : jobTitle
      ? `Visit ${jobTitle}`
      : "Visit";

  const statusRaw = formData.get("status");
  const normalizedStatus =
    typeof statusRaw === "string" && statusRaw.trim() ? statusRaw.trim() : "scheduled";

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null;

  const locationRaw = formData.get("location");
  const location = typeof locationRaw === "string" && locationRaw.trim() ? locationRaw.trim() : null;

  const { error, data } = await supabase
    .from("appointments")
    .insert({
      user_id: user.id,
      workspace_id: workspace.id,
      job_id: jobId,
      title,
      status: normalizedStatus,
      notes,
      location,
      start_time: startDate.toISOString(),
      end_time: endTimeIso,
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    console.error("[appointments/create] Failed to create appointment:", error);
    throw new Error("Unable to schedule appointment right now.");
  }

  revalidatePath("/appointments");
  if (jobId) {
    revalidatePath(`/jobs/${jobId}`);
  }

  redirect(`/appointments/${data.id}?created=true`);
}
