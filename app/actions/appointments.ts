"use server";

import { revalidatePath } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";

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
