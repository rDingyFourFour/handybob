export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type AppointmentRecord = {
  id: string;
  workspace_id: string;
  job_id: string | null;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fallbackCard(title: string, body: string) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{body}</p>
        <HbButton as="a" href="/dashboard" size="sm">
          Back to dashboard
        </HbButton>
      </HbCard>
    </div>
  );
}

export default async function CalendarPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[calendar] Failed to init Supabase client:", error);
    return fallbackCard(
      "Calendar unavailable",
      "Could not connect to Supabase. Check environment keys."
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
    return null;
  }

  let workspace;
  try {
    const workspaceResult = await getCurrentWorkspace({ supabase });
    workspace = workspaceResult.workspace;
  } catch (error) {
    console.error("[calendar] Failed to resolve workspace:", error);
    return fallbackCard(
      "Calendar unavailable",
      "Unable to resolve workspace. Please sign in again."
    );
  }

  if (!workspace) {
    return fallbackCard(
      "Calendar unavailable",
      "Unable to resolve workspace. Please sign in again."
    );
  }

  const now = new Date().toISOString();

  let appointments: AppointmentRecord[] = [];
  try {
    const { data, error } = await supabase
      .from<AppointmentRecord>("appointments")
      .select("id, workspace_id, job_id, title, start_time, end_time, status")
      .eq("workspace_id", workspace.id)
      .gte("start_time", now)
      .order("start_time", { ascending: true })
      .limit(50);

    if (error) {
      console.error("[calendar] Failed to load appointments:", error);
      return fallbackCard(
        "Calendar unavailable",
        "Could not load appointments. Please try again."
      );
    }

    appointments = data ?? [];
  } catch (error) {
    console.error("[calendar] Failed to load appointments:", error);
    return fallbackCard(
      "Calendar unavailable",
      "Could not load appointments. Please try again."
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="hb-shell pt-20 pb-8">
        <HbCard className="space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Calendar</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Calendar</h1>
          <p className="text-sm text-slate-400">No upcoming appointments scheduled.</p>
          <div className="flex flex-wrap gap-2">
            <HbButton as="a" href="/appointments" size="sm">
              View appointments
            </HbButton>
            <HbButton as="a" href="/jobs/new" variant="ghost" size="sm">
              Create job
            </HbButton>
          </div>
        </HbCard>
      </div>
    );
  }

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Calendar</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Calendar</h1>
          <p className="text-sm text-slate-400">Upcoming appointments.</p>
        </div>
        <div className="flex gap-2">
          <HbButton as="a" href="/dashboard" variant="ghost" size="sm">
            Back to dashboard
          </HbButton>
          <HbButton as="a" href="/appointments" size="sm">
            View appointments
          </HbButton>
        </div>
      </div>

      <HbCard className="space-y-4">
        {appointments.map((appointment) => (
          <div
            key={appointment.id}
            className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-3 transition hover:border-slate-600"
          >
            <div className="flex flex-col gap-1 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-base font-semibold text-slate-100">
                  {appointment.title?.trim() || "(no title)"}
                </p>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  {formatDate(appointment.start_time)}
                  {appointment.end_time
                    ? ` → ${formatDate(appointment.end_time)}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 text-xs uppercase tracking-[0.3em]">
                <span>{appointment.status ?? "scheduled"}</span>
                {appointment.job_id && (
                  <Link href={`/jobs/${appointment.job_id}`} className="text-sky-300 hover:text-sky-200">
                    View job
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </HbCard>
    </div>
  );
}
