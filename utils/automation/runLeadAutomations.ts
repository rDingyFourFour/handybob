// utils/automation/runLeadAutomations.ts
// Basic rule-based automation engine (v1):
// - If a new lead is marked ai_urgency='emergency', alert the user based on their automation_settings.
// This is intentionally simple and server-side; no user-authored rules yet.

import { createAdminClient } from "@/utils/supabase/admin";
import { sendCustomerMessageEmail } from "@/utils/email/sendCustomerMessage";
import { sendCustomerSms } from "@/utils/sms/sendCustomerSms";

type LeadAutomationArgs = {
  userId: string;
  workspaceId: string;
  jobId: string;
  title?: string | null;
  customerName?: string | null;
  summary?: string | null;
  aiUrgency?: string | null;
};

export async function runLeadAutomations({
  userId,
  workspaceId,
  jobId,
  title,
  customerName,
  summary,
  aiUrgency,
}: LeadAutomationArgs) {
  if ((aiUrgency || "").toLowerCase() !== "emergency") return;

  const supabase = createAdminClient();

  const { data: settings } = await supabase
    .from("automation_settings")
    .select("email_new_urgent_lead, sms_new_urgent_lead, sms_alert_number")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!settings) return;
  const emailEnabled = Boolean(settings.email_new_urgent_lead);
  const smsEnabled = Boolean(settings.sms_new_urgent_lead && settings.sms_alert_number);
  if (!emailEnabled && !smsEnabled) return;

  const user = await supabase.auth.admin.getUserById(userId).catch(() => null);
  const userEmail = user?.data?.user?.email;

  const subject = "New urgent lead detected";
  const body = [
    `New urgent lead: ${title || "Lead"}`,
    customerName ? `Customer: ${customerName}` : null,
    summary ? `Summary: ${summary.slice(0, 240)}` : null,
    `Job: ${jobId}`,
  ]
    .filter(Boolean)
    .join(" | ");

  if (emailEnabled && userEmail) {
    const channel = smsEnabled ? "both" : "email";
    try {
      await sendCustomerMessageEmail({
      to: userEmail,
      subject,
      body,
    });
      await logAutomationEvent({
        userId,
        workspaceId,
        jobId,
        type: "urgent_lead_alert",
        channel,
        status: "success",
        message: `Email sent to ${userEmail}`,
        supabase,
      });
    } catch (err) {
      await logAutomationEvent({
        userId,
        workspaceId,
        jobId,
        type: "urgent_lead_alert",
        channel,
        status: "failed",
        message: err instanceof Error ? err.message : "Email send failed",
        supabase,
      });
    }
  }

  if (smsEnabled && settings.sms_alert_number) {
    try {
      await sendCustomerSms({
        to: settings.sms_alert_number,
        body: body.slice(0, 320),
      });
      await logAutomationEvent({
        userId,
        workspaceId,
        jobId,
        type: "urgent_lead_alert",
        channel: emailEnabled ? "both" : "sms",
        status: "success",
        message: `SMS sent to ${settings.sms_alert_number}`,
        supabase,
      });
    } catch (err) {
      await logAutomationEvent({
        userId,
        workspaceId,
        jobId,
        type: "urgent_lead_alert",
        channel: emailEnabled ? "both" : "sms",
        status: "failed",
        message: err instanceof Error ? err.message : "SMS send failed",
        supabase,
      });
    }
  }
}

type LogArgs = {
  userId: string;
  workspaceId: string;
  jobId?: string | null;
  callId?: string | null;
  type: string;
  channel: string;
  status: string;
  message?: string | null;
  supabase: ReturnType<typeof createAdminClient>;
};

async function logAutomationEvent({
  userId,
  workspaceId,
  jobId,
  callId,
  type,
  channel,
  status,
  message,
  supabase,
}: LogArgs) {
  await supabase.from("automation_events").insert({
    user_id: userId,
    workspace_id: workspaceId,
    job_id: jobId ?? null,
    call_id: callId ?? null,
    type,
    channel,
    status,
    message: message ?? null,
  });
}
