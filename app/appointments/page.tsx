import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createServerClient } from "@/utils/supabase/server";
import { HintBox } from "@/components/ui/HintBox";

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

async function updateAppointmentStatusAction(formData: FormData) {
  "use server";

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const apptId = String(formData.get("appointment_id") || "");
  const nextStatus = String(formData.get("status") || "");
  const allowed = ["scheduled", "completed", "cancelled"];

  if (!apptId || !allowed.includes(nextStatus)) {
    throw new Error("Invalid appointment update");
  }

  await supabase
    .from("appointments")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", apptId);

  // Future Google Calendar sync point: when status changes, push updates to the
  // linked Google event (external_event_id) and listen for inbound changes via
  // Google webhook notifications or a polling job to keep Supabase in sync.

  revalidatePath("/appointments");
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ job_id?: string }>;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const resolvedSearch = await searchParams;
  const filterJobId = resolvedSearch?.job_id?.trim() || null;

  let appointmentsQuery = supabase
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

  if (filterJobId) {
    appointmentsQuery = appointmentsQuery.eq("job_id", filterJobId);
  }

  const { data: appts, error } = await appointmentsQuery;

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
                    {primaryJob?.id ? (
                      <Link href={`/jobs/${primaryJob.id}`} className="underline-offset-2 hover:underline">
                        {primaryJob.title || "No job linked"}
                      </Link>
                    ) : (
                      primaryJob?.title || "No job linked"
                    )}
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

                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/appointments/${appt.id}`} className="hb-button">
                    View
                  </Link>
                  {appt.status === "scheduled" && (
                    <>
                      <form action={updateAppointmentStatusAction}>
                        <input type="hidden" name="appointment_id" value={appt.id} />
                        <input type="hidden" name="status" value="completed" />
                        <button type="submit" className="hb-button-ghost text-xs">
                          Mark completed
                        </button>
                      </form>
                      <form action={updateAppointmentStatusAction}>
                        <input type="hidden" name="appointment_id" value={appt.id} />
                        <input type="hidden" name="status" value="cancelled" />
                        <button type="submit" className="hb-button-ghost text-xs text-red-300">
                          Cancel
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
            <p className="text-lg font-semibold text-slate-100">
              No appointments scheduled. Once you create jobs, you can schedule visits here.
            </p>
            <p className="hb-muted text-sm max-w-xl">
              Keep the calendar full by linking jobs to customers and booking visits ahead of time.
            </p>
            <Link href="/appointments/new" className="hb-button">
              New appointment
            </Link>
            <HintBox id="appointments-no-appointments" title="Hint">
              After you log a job, you can schedule a visit or work session right from the job timeline so the calendar stays in sync.
            </HintBox>
          </div>
        )}
      </div>
    </div>
  );
}
