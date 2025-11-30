export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type AppointmentRow = {
  id: string;
  workspace_id: string;
  job_id: string | null;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  created_at: string | null;
  job?: { id: string | null; title: string | null } | null;
};

export default async function AppointmentsPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[appointments] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[appointments] Failed to resolve user:", error);
    redirect("/");
  }

  if (!user) {
    redirect("/");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[appointments] Failed to resolve workspace:", error);
    return (
      <div className="hb-shell pt-20 pb-8">
        <HbCard className="space-y-3">
          <h1 className="hb-heading-1 text-2xl font-semibold">Unable to load appointments</h1>
          <p className="hb-muted text-sm">Please return to the dashboard and try again.</p>
          <Link
            href="/dashboard"
            className="text-xs uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-100"
          >
            ← Back to dashboard
          </Link>
        </HbCard>
      </div>
    );
  }

  if (!workspace) {
    redirect("/");
  }

  let appointments: AppointmentRow[] = [];
  let appointmentsError: unknown = null;

  try {
    const { data, error } = await supabase
      .from("appointments")
      .select("id, workspace_id, job_id, title, start_time, end_time, status, created_at, job:jobs(id, title)")
      .eq("workspace_id", workspace.id)
      .order("start_time", { ascending: false })
      .limit(50);
    if (error) {
      console.error("[appointments] Failed to load appointments:", error);
      appointmentsError = error;
    } else {
      appointments = (data ?? []) as AppointmentRow[];
    }
  } catch (error) {
    console.error("[appointments] Failed to load appointments:", error);
    appointmentsError = error;
  }

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

  const shortId = (value: string) => value.slice(0, 8);

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Appointments</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Appointments</h1>
          <p className="hb-muted text-sm">See upcoming and recent visits in one place.</p>
        </div>
        <HbButton as={Link} href="/appointments/new" size="sm">
          New appointment
        </HbButton>
      </header>

      {appointmentsError ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">Something went wrong</h2>
          <p className="hb-muted text-sm">We couldn’t load this page. Try again or go back.</p>
        </HbCard>
      ) : appointments.length === 0 ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">No appointments yet</h2>
          <p className="hb-muted text-sm">You can create one using the button above.</p>
          <Link
            href="/jobs/new"
            className="text-xs uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-100"
          >
            → Create a job
          </Link>
        </HbCard>
      ) : (
        <HbCard className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="hb-card-heading text-lg font-semibold">All appointments</h2>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Showing {appointments.length} visit{appointments.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="space-y-2">
            {appointments.map((appt) => (
              <article
                key={appt.id}
                className="group rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-3 transition hover:border-slate-600"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 text-sm text-slate-400">
                    <p className="text-base font-semibold text-slate-100">
                      {appt.title ?? `Appointment ${shortId(appt.id)}`}
                    </p>
                    <p className="text-sm text-slate-400">
                      {formatDate(appt.start_time)}
                      {appt.end_time ? ` – ${formatDate(appt.end_time)}` : ""}
                    </p>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                      Status: {appt.status ?? "scheduled"}
                    </p>
                    {appt.job?.title && (
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                        Job: {appt.job.title}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right text-[11px] uppercase tracking-[0.3em]">
                    <Link
                      href={`/appointments/${appt.id}`}
                      className="text-sky-300 hover:text-sky-200"
                    >
                      View appointment
                    </Link>
                    {appt.job_id ? (
                      <Link
                        href={`/jobs/${appt.job_id}`}
                        className="text-sky-300 hover:text-sky-200"
                      >
                        View job
                      </Link>
                    ) : (
                      <span className="text-slate-500">Job TBD</span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </HbCard>
      )}
    </div>
  );
}
