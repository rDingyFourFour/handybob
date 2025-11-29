import Link from "next/link";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";

export const dynamic = "force-dynamic";


type CalendarAppointment = {
  id: string;
  title: string | null;
  start_time: string | null;
  jobs:
    | {
        title: string | null;
      }
    | {
        title: string | null;
      }[]
    | null;
};

function buildMonthDays(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const days: { date: Date }[] = [];
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    days.push({ date: new Date(d) });
  }
  return days;
}

export default async function CalendarPage() {
  const supabase = await createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const { data: appts, error } = await supabase
    .from("appointments")
    .select(
      `
        id,
        title,
        start_time,
        jobs ( title )
      `
    )
    .eq("workspace_id", workspace.id)
    .gte("start_time", monthStart.toISOString())
    .lt("start_time", nextMonthStart.toISOString())
    .order("start_time", { ascending: true });

  const appointments = (appts ?? []) as CalendarAppointment[];
  const days = buildMonthDays(now);

  const appointmentsByDay = appointments.reduce<Record<string, CalendarAppointment[]>>(
    (acc, appt) => {
      if (!appt.start_time) return acc;
      const key = new Date(appt.start_time).toISOString().slice(0, 10);
      acc[key] = acc[key] || [];
      acc[key].push(appt);
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-6">
      <div className="hb-card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Calendar</h1>
          <p className="hb-muted">Month overview of your appointments.</p>
        </div>
        <Link href="/appointments" className="hb-button-ghost">
          Back to list
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-400">Failed to load appointments: {error.message}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {days.map(({ date }) => {
            const dateKey = date.toISOString().slice(0, 10);
            const dayAppts = appointmentsByDay[dateKey] || [];
            return (
              <div key={dateKey} className="hb-card space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">
                    {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <span className="hb-muted text-xs">{dayAppts.length} appt</span>
                </div>
                {dayAppts.length === 0 ? (
                  <p className="hb-muted text-xs">No appointments</p>
                ) : (
                  <div className="space-y-1">
                    {dayAppts.map((appt) => (
                      <Link
                        href={`/appointments/${appt.id}`}
                        key={appt.id}
                        className="block rounded border border-slate-800 px-2 py-1 text-xs hover:border-slate-700"
                      >
                        <div className="font-semibold">{appt.title || "Appointment"}</div>
                        <div className="hb-muted">
                          {new Date(appt.start_time!).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {Array.isArray(appt.jobs)
                            ? appt.jobs[0]?.title
                              ? ` · ${appt.jobs[0].title}`
                              : ""
                            : appt.jobs?.title
                            ? ` · ${appt.jobs.title}`
                            : ""}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
