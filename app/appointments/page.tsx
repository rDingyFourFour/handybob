import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";

type AppointmentListItem = {
  id: string;
  title: string | null;
  status: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  jobs:
    | {
        id: string;
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
        id: string;
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

export default async function AppointmentsPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appts, error } = await supabase
    .from("appointments")
    .select(
      `
        id,
        title,
        status,
        start_time,
        end_time,
        location,
        jobs ( id, title, customers ( name ) )
      `
    )
    .order("start_time", { ascending: false });

  const appointments = (appts ?? []) as AppointmentListItem[];

  return (
    <div className="space-y-6">
      <div className="hb-card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Appointments</h1>
          <p className="hb-muted">View and manage scheduled visits.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/appointments/calendar" className="hb-button-ghost">
            Calendar view
          </Link>
          <Link href="/appointments/new" className="hb-button">
            New appointment
          </Link>
        </div>
      </div>

      <div className="hb-card space-y-4">
        {error ? (
          <p className="text-sm text-red-400">Failed to load appointments: {error.message}</p>
        ) : appointments.length ? (
          appointments.map((appt) => {
            const startDate = appt.start_time ? new Date(appt.start_time) : null;
            const endDate = appt.end_time ? new Date(appt.end_time) : null;
            const start = startDate
              ? startDate.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : "";
            const end = endDate
              ? endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : null;
            const primaryJob = Array.isArray(appt.jobs) ? appt.jobs[0] ?? null : appt.jobs;
            const customer = Array.isArray(primaryJob?.customers)
              ? primaryJob?.customers[0]
              : primaryJob?.customers;
            const statusTone = appt.status === "completed"
              ? "text-emerald-400"
              : appt.status === "cancelled"
              ? "text-red-400"
              : "text-sky-300";
            return (
              <div
                key={appt.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-800 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <p className="font-semibold">{appt.title || "Appointment"}</p>
                  <p className="hb-muted text-sm">
                    {primaryJob?.title || "No job linked"}
                  </p>
                  <p className="hb-muted text-sm">
                    {customer?.name ? `Customer: ${customer.name}` : "Customer: Unknown"}
                  </p>
                  <p className="hb-muted text-xs">
                    {start}
                    {end ? ` – ${end}` : ""}
                  </p>
                  {appt.location && (
                    <p className="hb-muted text-xs">Location: {appt.location}</p>
                  )}
                  <p className={`text-xs font-semibold ${statusTone}`}>
                    {appt.status || "scheduled"}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Link href={`/appointments/${appt.id}`} className="hb-button">
                    View
                  </Link>
                </div>
              </div>
            );
          })
        ) : (
          <p className="hb-muted text-sm">No appointments scheduled. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}
