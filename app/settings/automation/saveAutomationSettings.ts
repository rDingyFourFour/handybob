// app/settings/automation/saveAutomationSettings.ts
"use server";

import { revalidatePath } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace, requireOwner } from "@/utils/workspaces";
import { logAuditEvent } from "@/utils/audit/log";

export async function saveAutomationSettings(formData: FormData) {
  const supabase = createServerClient();
  const workspaceContext = await getCurrentWorkspace({ supabase });
  requireOwner(workspaceContext);
  const workspace = workspaceContext.workspace;

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

  await logAuditEvent({
    supabase,
    workspaceId: workspace.id,
    actorUserId: workspaceContext.user.id,
    action: "settings_updated",
    entityType: "automation_settings",
    entityId: workspace.id,
    metadata: {
      email_new_urgent_lead: emailNewUrgentLead,
      sms_new_urgent_lead: smsNewUrgentLead,
      sms_alert_number: smsAlertNumber,
    },
  });

  revalidatePath("/settings/automation");
}
