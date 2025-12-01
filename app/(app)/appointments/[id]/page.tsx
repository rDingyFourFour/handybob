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
  notes: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  created_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown time";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return "Not scheduled";
  const startLabel = formatDate(start);
  const endLabel = end ? formatDate(end) : null;
  return endLabel ? `${startLabel} → ${endLabel}` : startLabel;
}

function fallbackCard(title: string, body: string) {
  return (
    <div className="hb-shell pt-20 pb-8 space-y-4">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{body}</p>
        <HbButton as="a" href="/appointments" size="sm">
          Back to appointments
        </HbButton>
      </HbCard>
    </div>
  );
}

export default async function AppointmentDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  if (!id || !id.trim()) {
    redirect("/appointments");
    return null;
  }

  if (id === "new") {
    redirect("/appointments/new");
    return null;
  }

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[appointment-detail] Failed to init Supabase client:", error);
    return fallbackCard("Appointment unavailable", "Could not connect to Supabase. Please try again.");
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
    console.error("[appointment-detail] Failed to resolve workspace:", error);
    return fallbackCard("Appointment unavailable", "Unable to resolve workspace. Please try again.");
  }

  if (!workspace) {
    return fallbackCard("Appointment unavailable", "Unable to resolve workspace. Please try again.");
  }

  let appointment: AppointmentRecord | null = null;

  try {
    const { data, error } = await supabase
      .from<AppointmentRecord>("appointments")
      .select("id, workspace_id, job_id, title, notes, start_time, end_time, status, created_at")
      .eq("workspace_id", workspace.id)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[appointment-detail] Appointment lookup failed:", error);
      return fallbackCard("Appointment not found", "We couldn’t find that appointment. It may have been deleted.");
    }

    appointment = data ?? null;
  } catch (error) {
    console.error("[appointment-detail] Appointment query error:", error);
    return fallbackCard("Appointment not found", "We couldn’t find that appointment. It may have been deleted.");
  }

  if (!appointment) {
    return fallbackCard("Appointment not found", "We couldn’t find that appointment. It may have been deleted.");
  }

  const title = appointment.title ?? "Appointment details";
  const statusLabel = appointment.status ?? "scheduled";
  const notesLabel = appointment.notes?.trim();

  const quoteHref =
    appointment.job_id && appointment.job_id.trim()
      ? `/quotes/new?${buildQuoteParams(appointment.job_id, appointment.notes ?? appointment.title)}`
      : null;

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <HbCard className="space-y-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Appointment details</p>
            <h1 className="hb-heading-2 text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-slate-400">
              {statusLabel ? `Status: ${statusLabel}` : "Status: scheduled"}
            </p>
            <p className="text-sm text-slate-400">Time: {formatRange(appointment.start_time, appointment.end_time)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <HbButton as="a" href="/appointments" variant="ghost" size="sm">
              Back to appointments
            </HbButton>
            {quoteHref && (
              <HbButton as={Link} href={quoteHref} variant="secondary" size="sm">
                Generate quote for this job
              </HbButton>
            )}
            <HbButton as="a" href="/appointments/new" size="sm">
              Log new appointment
            </HbButton>
          </div>
        </header>
        <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-2">
          <p>
            <span className="font-semibold">When:</span> {formatRange(appointment.start_time, appointment.end_time)}
          </p>
          <p>
            <span className="font-semibold">Status:</span> {appointment.status ?? "—"}
          </p>
          <p>
            <span className="font-semibold">Notes:</span> {notesLabel || "No notes yet."}
          </p>
          {appointment.job_id && (
            <p>
              <span className="font-semibold">Job:</span>{" "}
              <Link href={`/jobs/${appointment.job_id}`} className="text-sky-300 hover:text-sky-200">
                View job
              </Link>
            </p>
          )}
        </div>
      </HbCard>
    </div>
  );
}

function buildQuoteParams(jobId: string, description?: string | null) {
  const params = new URLSearchParams();
  params.set("jobId", jobId);
  params.set("source", "job");
  const trimmed = (description ?? "").trim();
  if (trimmed) {
    params.set("description", trimmed);
  }
  return params.toString();
}
