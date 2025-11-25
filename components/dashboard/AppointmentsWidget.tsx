"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { formatFriendlyDateTime, DEFAULT_TIMEZONE } from "@/utils/dashboard/time";
import { markAppointmentCompleted } from "@/app/actions/appointments";
import { AppointmentsSkeleton } from "./AppointmentsSkeleton";

type JobRow = {
  title: string | null;
  customers?: { id: string | null; name: string | null }[] | null;
};

type AppointmentRow = {
  id: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  jobs: JobRow | JobRow[] | null;
};

type Props = {
  workspaceId: string;
  workspaceTimeZone?: string | null;
  todayEndIso: string;
};

function normalizeCustomer(
  customer: { id?: string | null; name: string | null } | { id?: string | null; name: string | null }[] | null | undefined
) {
  if (!customer) return null;
  return Array.isArray(customer) ? customer[0] ?? null : customer;
}

export function AppointmentsWidget({
  workspaceId,
  workspaceTimeZone,
  todayEndIso,
}: Props) {
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const timezone = workspaceTimeZone || DEFAULT_TIMEZONE;
  const supabaseClient = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!workspaceId) return;

    let canceled = false;

    const loadAppointments = async () => {
      setStatus("loading");
      setErrorMessage(null);
      const { data, error } = await supabaseClient
        .from("appointments")
        .select(
          `
            id,
            title,
            start_time,
            end_time,
            jobs (
              title,
              customers ( id, name )
            )
          `
        )
        .eq("workspace_id", workspaceId)
        .lte("start_time", todayEndIso)
        .neq("status", "completed")
        .order("start_time", { ascending: true })
        .limit(15);

      if (canceled) return;

      if (error) {
        setErrorMessage(error.message || "Unable to load appointments right now.");
        setStatus("error");
        return;
      }

      setAppointments((data ?? []) as AppointmentRow[]);
      setStatus("idle");
    };

    void loadAppointments();

    return () => {
      canceled = true;
    };
  }, [workspaceId, todayEndIso, refreshIndex, supabaseClient]);

  const retry = () => setRefreshIndex((value) => value + 1);

  if (status === "error") {
    return (
      <div className="space-y-2">
        <div className="rounded border border-slate-800 px-3 py-3 text-sm text-slate-300">
          <p className="text-sm text-slate-200">{errorMessage || "Unable to load appointments right now."}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-2 text-[11px] text-slate-400 hover:text-slate-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return <AppointmentsSkeleton rows={3} />;
  }

  if (appointments.length === 0) {
    return <p className="hb-muted text-sm">No appointments scheduled for today.</p>;
  }

  return (
    <div className="space-y-0 divide-y divide-slate-800/60">
      {appointments.slice(0, 3).map((appt) => {
        const job = Array.isArray(appt.jobs) ? appt.jobs[0] ?? null : appt.jobs;
        const jobTitle = job?.title || "No job linked";
        const customer = normalizeCustomer(job?.customers);
        const customerLabel = customer?.name || "Unknown customer";
        const appointmentLabel = formatFriendlyDateTime(appt.start_time, appt.end_time, timezone);

        return (
          <div key={appt.id} className="rounded border border-slate-800 px-3 py-3 text-sm">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-slate-200">{appt.title || "Appointment"}</span>
                <span className="text-sm font-semibold text-slate-400">{appointmentLabel || "-"}</span>
              </div>
              <p className="text-sm text-slate-300">
                {customerLabel} • {jobTitle}
              </p>
            </div>
            <form action={markAppointmentCompleted} className="pt-2">
              <input type="hidden" name="appointmentId" value={appt.id} />
              <button type="submit" className="text-[11px] text-slate-400 hover:text-slate-200">
                Mark completed
              </button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
