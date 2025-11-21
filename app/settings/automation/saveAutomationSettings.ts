// app/settings/automation/saveAutomationSettings.ts
"use server";

import { revalidatePath } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/utils/workspaces";

export async function saveAutomationSettings(formData: FormData) {
  const supabase = createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  const emailNewUrgentLead = formData.get("email_new_urgent_lead") === "on";
  const smsNewUrgentLead = formData.get("sms_new_urgent_lead") === "on";
  const smsAlertNumber = (formData.get("sms_alert_number") as string | null) || null;

  await supabase
    .from("automation_settings")
    .upsert({
      workspace_id: workspace.id,
      email_new_urgent_lead: emailNewUrgentLead,
      sms_new_urgent_lead: smsNewUrgentLead,
      sms_alert_number: smsAlertNumber,
    })
    .select("workspace_id")
    .single();

  revalidatePath("/settings/automation");
}
