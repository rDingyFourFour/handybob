"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";

type AppointmentStatus = "completed" | "no_show";

async function updateStatus(formData: FormData, status: AppointmentStatus) {
  const appointmentId = (formData.get("appointmentId") as string | null)?.trim();
  if (!appointmentId) {
    throw new Error("Appointment ID is required");
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const workspaceContext = await getCurrentWorkspace({ supabase });

  const { error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("workspace_id", workspaceContext.workspace.id)
    .eq("id", appointmentId);

  if (error) {
    console.error(`[appointment-status] update failed`, error);
    throw error;
  }

  revalidatePath(`/appointments/${appointmentId}`);
  revalidatePath("/appointments");
  redirect(`/appointments/${appointmentId}?statusUpdated=${encodeURIComponent(status)}`);
}

export async function markAppointmentCompleted(formData: FormData) {
  return updateStatus(formData, "completed");
}

export async function markAppointmentNoShow(formData: FormData) {
  return updateStatus(formData, "no_show");
}
