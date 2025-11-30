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
  notes: string | null;
  created_at: string | null;
};

function formatDate(value: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  });
}

type ShellCardProps = {
  title: string;
  subtitle: string;
  buttonLabel?: string;
  buttonHref?: string;
};

function renderShellCard({
  title,
  subtitle,
  buttonLabel = "Back to dashboard",
  buttonHref = "/dashboard",
}: ShellCardProps) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{subtitle}</p>
        <HbButton as="a" href={buttonHref} size="sm">
          {buttonLabel}
        </HbButton>
      </HbCard>
    </div>
  );
}

function renderEmptyCalendarCard() {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-4">
        <h1 className="hb-heading-1 text-2xl font-semibold">No upcoming appointments</h1>
        <p className="text-sm text-slate-400">You can create one using the button above.</p>
        <div className="flex flex-wrap gap-2">
          <HbButton as="a" href="/appointments/new" size="sm">
            New appointment
          </HbButton>
          <HbButton as="a" href="/dashboard" variant="ghost" size="sm">
            Back to dashboard
          </HbButton>
        </div>
      </HbCard>
    </div>
  );
}

function formatTimeRange(start: string | null, end: string | null) {
  const startLabel = formatDate(start);
  const endLabel = formatDate(end, { hour: "numeric", minute: "2-digit" });
  if (start && end) {
    return `${startLabel} – ${endLabel}`;
  }
  if (start) {
    return startLabel;
  }
  return "Time TBD";
}

export default async function CalendarPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[calendar] Failed to init Supabase client:", error);
    return renderShellCard({
      title: "Something went wrong",
      subtitle: "We couldn’t load this page. Try again or go back.",
    });
  }

  let user;
  try {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    user = currentUser;
  } catch (error) {
    console.error("[calendar] Failed to fetch auth user:", error);
  }

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
    return renderShellCard({
      title: "Something went wrong",
      subtitle: "We couldn’t load this page. Try again or go back.",
    });
  }

  if (!workspace) {
    return renderShellCard({
      title: "Something went wrong",
      subtitle: "We couldn’t load this page. Try again or go back.",
    });
  }

  const now = new Date().toISOString();

  let appointments: AppointmentRecord[];
  try {
    const { data, error } = await supabase
      .from<AppointmentRecord>("appointments")
      .select(
        `
          id,
          workspace_id,
          job_id,
          title,
          start_time,
          end_time,
          status,
          notes,
          created_at
        `
      )
      .eq("workspace_id", workspace.id)
      .gte("start_time", now)
      .order("start_time", { ascending: true });

    if (error) {
      throw error;
    }

    appointments = data ?? [];
  } catch (error) {
    console.error("[calendar] Failed to load appointments:", error);
    return renderShellCard({
      title: "Something went wrong",
      subtitle: "We couldn’t load this page. Try again or go back.",
      buttonLabel: "View appointments",
      buttonHref: "/appointments",
    });
  }

  if (appointments.length === 0) {
    return renderEmptyCalendarCard();
  }

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <HbCard className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="hb-heading-2 text-2xl font-semibold">Upcoming appointments</h1>
            <p className="text-sm text-slate-400">Upcoming appointments</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <HbButton as="a" href="/appointments/new" size="sm">
              New appointment
            </HbButton>
            <HbButton as="a" href="/appointments" variant="ghost" size="sm">
              View appointments
            </HbButton>
          </div>
        </div>
      </HbCard>

      <HbCard className="space-y-3">
        {appointments.map((appointment) => {
          const title = appointment.title?.trim() || "(no title)";
          const timeRange = formatTimeRange(appointment.start_time, appointment.end_time);
          return (
            <article
              key={appointment.id}
              className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4 transition hover:border-slate-600"
            >
              <div className="flex flex-col gap-3 text-sm text-slate-400 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <p className="text-base font-semibold text-slate-100">{title}</p>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{timeRange}</p>
                  <span className="inline-flex items-center rounded-full border border-slate-700 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200">
                    {appointment.status ? appointment.status : "scheduled"}
                  </span>
                </div>
                <div className="text-right text-sm">
                  {appointment.job_id ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Job:</span>
                      <Link
                        href={`/jobs/${appointment.job_id}`}
                        className="text-sky-300 hover:text-sky-200 font-semibold"
                      >
                        View job
                      </Link>
                    </div>
                  ) : (
                    <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Job: No job linked</span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </HbCard>
    </div>
  );
}
