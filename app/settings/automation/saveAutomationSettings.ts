// app/settings/automation/saveAutomationSettings.ts
"use server";

import { revalidatePath } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";

export async function saveAutomationSettings(formData: FormData) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const emailNewUrgentLead = formData.get("email_new_urgent_lead") === "on";
  const smsNewUrgentLead = formData.get("sms_new_urgent_lead") === "on";
  const smsAlertNumber = (formData.get("sms_alert_number") as string | null) || null;

  await supabase
    .from("automation_settings")
    .upsert({
      user_id: user.id,
      email_new_urgent_lead: emailNewUrgentLead,
      sms_new_urgent_lead: smsNewUrgentLead,
      sms_alert_number: smsAlertNumber,
    })
    .select("user_id")
    .single();

  revalidatePath("/settings/automation");
}
