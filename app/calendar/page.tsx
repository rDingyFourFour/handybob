import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";

type CalendarAppointment = {
  id: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  jobs:
    | {
        title: string | null;
        customers:
          | {
              name: string | null;
            }
          | {
              name: string | null;
            }[]
          | null;
      }
    | {
        title: string | null;
        customers:
          | {
              name: string | null;
            }
          | {
              name: string | null;
            }[]
          | null;
      }[]
    | null;
};

function getWeekRange(base: Date) {
  const start = new Date(base);
  const day = start.getDay();
  const diff = start.getDay() === 0 ? -6 : 1 - day; // start on Monday
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setHours(0, 0, 0, 0);

  return { start, end };
}

function formatDay(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default async function CalendarPage({ searchParams }: { searchParams?: { weekStart?: string } }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const baseDate = searchParams?.weekStart ? new Date(searchParams.weekStart) : new Date();
  const { start, end } = getWeekRange(baseDate);

  const { data: appts, error } = await supabase
    .from("appointments")
    .select(
      `
        id,
        title,
        start_time,
        end_time,
        jobs (
          title,
          customers ( name )
        )
      `
    )
    .gte("start_time", start.toISOString())
    .lt("start_time", end.toISOString())
    .order("start_time", { ascending: true });

  const appointments = (appts ?? []) as CalendarAppointment[];

  const apptsByDay = appointments.reduce<Record<string, CalendarAppointment[]>>((acc, appt) => {
    if (!appt.start_time) return acc;
    const key = new Date(appt.start_time).toISOString().slice(0, 10);
    acc[key] = acc[key] || [];
    acc[key].push(appt);
    return acc;
  }, {});

  const days: Date[] = [];
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  const prevWeek = new Date(start);
  prevWeek.setDate(prevWeek.getDate() - 7);
  const nextWeek = new Date(start);
  nextWeek.setDate(nextWeek.getDate() + 7);

  return (
    <div className="space-y-4">
      <div className="hb-card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Calendar</h1>
          <p className="hb-muted">Appointments grouped by day.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/appointments" className="hb-button-ghost">
            Appointments list
          </Link>
          <Link href={`/calendar?weekStart=${prevWeek.toISOString().slice(0, 10)}`} className="hb-button-ghost">
            Previous week
          </Link>
          <Link href={`/calendar?weekStart=${nextWeek.toISOString().slice(0, 10)}`} className="hb-button-ghost">
            Next week
          </Link>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-400">Failed to load appointments: {error.message}</p>
      ) : appointments.length === 0 ? (
        <p className="hb-muted text-sm">No appointments this week.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {days.map((day) => {
            const key = day.toISOString().slice(0, 10);
            const dayAppts = apptsByDay[key] || [];
            return (
              <div key={key} className="hb-card space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{formatDay(day)}</span>
                  <span className="hb-muted text-xs">{dayAppts.length} appt</span>
                </div>
                {dayAppts.length === 0 ? (
                  <p className="hb-muted text-xs">No appointments</p>
                ) : (
                  <div className="space-y-2">
                    {dayAppts.map((appt) => {
                      const startTime = appt.start_time
                        ? new Date(appt.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "";
                      const endTime = appt.end_time
                        ? new Date(appt.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : null;
                      const job = Array.isArray(appt.jobs) ? appt.jobs[0] ?? null : appt.jobs;
                      const customer = Array.isArray(job?.customers)
                        ? job?.customers[0]
                        : job?.customers;

                      return (
                        <div key={appt.id} className="rounded border border-slate-800 px-3 py-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{appt.title || "Appointment"}</span>
                            <span className="hb-muted text-xs">
                              {startTime}
                              {endTime ? ` – ${endTime}` : ""}
                            </span>
                          </div>
                          <p className="hb-muted text-xs">
                            {job?.title || "No job linked"}
                          </p>
                          <p className="hb-muted text-[11px]">
                            {customer?.name ? `Customer: ${customer.name}` : "Customer: Unknown"}
                          </p>
                        </div>
                      );
                    })}
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
