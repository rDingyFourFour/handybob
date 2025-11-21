import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/utils/workspaces";
import { saveAutomationSettings } from "./saveAutomationSettings";

type SettingsRow = {
  email_new_urgent_lead: boolean | null;
  sms_new_urgent_lead: boolean | null;
  sms_alert_number: string | null;
};

type AutomationEvent = {
  id: string;
  type: string | null;
  channel: string | null;
  status: string | null;
  message: string | null;
  created_at: string | null;
  job_id?: string | null;
  call_id?: string | null;
};

export default async function AutomationSettingsPage() {
  const supabase = createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  const { data } = await supabase
    .from("automation_settings")
    .select("email_new_urgent_lead, sms_new_urgent_lead, sms_alert_number")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  const { data: events } = await supabase
    .from("automation_events")
    .select("id, type, channel, status, message, created_at, job_id, call_id")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const initial: SettingsRow = {
    email_new_urgent_lead: data?.email_new_urgent_lead ?? false,
    sms_new_urgent_lead: data?.sms_new_urgent_lead ?? false,
    sms_alert_number: data?.sms_alert_number ?? "",
  };
  const safeEvents: AutomationEvent[] = events ?? [];

  return (
    <div className="space-y-4">
      <div className="hb-card space-y-2">
        <div>
          <h1>Notifications & automation</h1>
          <p className="hb-muted text-sm">Configure alerts for urgent leads (AI urgency = emergency).</p>
        </div>
        <form action={saveAutomationSettings} className="space-y-3">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="email_new_urgent_lead"
                defaultChecked={initial.email_new_urgent_lead ?? false}
                className="hb-checkbox"
              />
              <span>Email alerts for new urgent leads</span>
            </label>
            <p className="hb-muted text-xs">
              Sends an email when AI urgency is classified as emergency on a new lead.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="sms_new_urgent_lead"
                defaultChecked={initial.sms_new_urgent_lead ?? false}
                className="hb-checkbox"
              />
              <span>SMS alerts for new urgent leads</span>
            </label>
            <div className="flex flex-col gap-1">
              <label className="hb-label text-xs" htmlFor="sms_alert_number">
                SMS number
              </label>
              <input
                id="sms_alert_number"
                name="sms_alert_number"
                placeholder="+1..."
                defaultValue={initial.sms_alert_number ?? ""}
                className="hb-input"
              />
              <p className="hb-muted text-xs">Used only if SMS alerts are enabled.</p>
            </div>
          </div>
          <div className="rounded border border-slate-800 px-3 py-2 text-xs text-slate-400">
            Urgent = AI urgency classified as “emergency”. Future flags can expand this.
          </div>
          <button type="submit" className="hb-button">
            Save settings
          </button>
        </form>
      </div>

      <div className="hb-card space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Recent automation events</h2>
            <p className="hb-muted text-sm">Last 10 alerts to verify delivery.</p>
          </div>
        </div>
        {!safeEvents.length ? (
          <p className="hb-muted text-sm">No automation events yet.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {safeEvents.map((event) => (
              <div key={event.id} className="rounded border border-slate-800 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{event.type || "event"}</span>
                  <span className="text-[11px] uppercase text-slate-500">
                    {event.channel || "unknown"} · {event.status || "unknown"}
                  </span>
                </div>
                <p className="hb-muted text-xs">
                  {event.message || "No details"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {event.created_at ? new Date(event.created_at).toLocaleString() : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
