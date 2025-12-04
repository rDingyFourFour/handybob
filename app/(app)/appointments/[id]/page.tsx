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
  location: string | null;
  start_time: string | null;
  end_time: string | null;
  status: "scheduled" | "completed" | "cancelled" | "canceled" | null;
};

type JobCustomer = {
  id: string;
  name: string | null;
  phone: string | null;
};

type AppointmentDetailRow = AppointmentRecord & {
  job?: {
    id: string | null;
    title: string | null;
    status: string | null;
    customer_id: string | null;
    customers?: JobCustomer | JobCustomer[] | null;
  } | null;
};

const STATUS_META: Record<
  Extract<AppointmentRecord["status"], Exclude<AppointmentRecord["status"], null>>,
  { label: string; className: string }
> = {
  scheduled: { label: "Scheduled", className: "bg-amber-500/10 text-amber-200 border border-amber-500/40" },
  completed: { label: "Completed", className: "bg-emerald-500/10 text-emerald-200 border border-emerald-500/40" },
  cancelled: { label: "Canceled", className: "bg-rose-500/10 text-rose-200 border border-rose-500/40" },
  canceled: { label: "Canceled", className: "bg-rose-500/10 text-rose-200 border border-rose-500/40" },
};

function formatDate(value: string | null) {
  if (!value) {
    return "Date TBD";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Date TBD";
  }
  return parsed.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatTimeRange(start: string | null, end: string | null) {
  if (!start && !end) {
    return "Time TBD";
  }
  const parsedStart = start ? new Date(start) : null;
  const parsedEnd = end ? new Date(end) : null;

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };

  if (!parsedStart && parsedEnd) {
    return parsedEnd.toLocaleTimeString(undefined, timeOptions);
  }
  if (parsedStart && !parsedEnd) {
    return parsedStart.toLocaleTimeString(undefined, timeOptions);
  }

  return `${parsedStart!.toLocaleTimeString(undefined, timeOptions)} — ${parsedEnd!.toLocaleTimeString(
    undefined,
    timeOptions
  )}`;
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

function resolveCustomer(
  job?: AppointmentDetailRow["job"]
): JobCustomer | null {
  if (!job) {
    return null;
  }
  if (!job.customers) {
    return null;
  }
  if (Array.isArray(job.customers)) {
    return job.customers[0] ?? null;
  }
  return job.customers;
}

function statusMeta(status: AppointmentRecord["status"]) {
  if (!status) {
    return { label: "Scheduled", className: "bg-amber-500/10 text-amber-200 border border-amber-500/40" };
  }
  return STATUS_META[status] ?? STATUS_META.scheduled;
}

export default async function AppointmentDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const showSuccessHint = searchParams?.created === "true";

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

  let appointment: AppointmentDetailRow | null = null;

  try {
    const { data, error } = await supabase
      .from<AppointmentDetailRow>("appointments")
      .select(
        `
          id,
          workspace_id,
          job_id,
          title,
          notes,
          location,
          start_time,
          end_time,
          status,
          job:jobs (
            id,
            title,
            status,
            customer_id,
            customers (
              id,
              name,
              phone
            )
          )
        `
      )
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

  const title = appointment.title ?? "Visit details";
  const currentStatus = statusMeta(appointment.status);
  const jobSummary = appointment.job;
  const customer = resolveCustomer(jobSummary);
  const jobHref = jobSummary?.id ? `/jobs/${jobSummary.id}` : null;
  const customerHref = customer?.id ? `/customers/${customer.id}` : null;
  const phoneAgentHref = jobSummary?.id ? `/calls/new?jobId=${jobSummary.id}` : null;

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      {showSuccessHint && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Appointment scheduled.
          <Link href="/appointments" className="ml-2 font-semibold text-emerald-100 hover:text-emerald-50">
            View appointments
          </Link>
        </div>
      )}
      <HbCard className="space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Appointment details</p>
            <h1 className="hb-heading-2 text-2xl font-semibold text-slate-50">{title}</h1>
            <p className="text-sm text-slate-400">Visit card for the work ahead.</p>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full px-4 py-1 text-xs font-semibold ${currentStatus.className}`}>
            {currentStatus.label}
          </div>
        </header>

        <div className="grid gap-6 text-sm text-slate-300 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">When</p>
            <p className="text-base font-semibold text-slate-100">{formatDate(appointment.start_time)}</p>
            <p className="text-sm text-slate-400">{formatTimeRange(appointment.start_time, appointment.end_time)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Location</p>
            <p className="text-base font-semibold text-slate-100">{appointment.location ?? "Location TBD"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Job</p>
            {jobSummary && jobHref ? (
              <Link href={jobHref} className="text-base font-semibold text-sky-300 hover:text-sky-200">
                {jobSummary.title ?? jobSummary.id}
              </Link>
            ) : (
              <p className="text-base font-semibold text-slate-100">Unlinked job</p>
            )}
            {jobSummary?.status && (
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">{jobSummary.status}</p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Customer</p>
            {customer && customerHref ? (
              <Link href={customerHref} className="text-base font-semibold text-slate-50 hover:text-slate-100">
                {customer.name ?? `Customer ${customer.id.slice(0, 8)}`}
              </Link>
            ) : (
              <p className="text-base font-semibold text-slate-100">Customer TBD</p>
            )}
            {customer?.phone && (
              <p className="text-sm text-slate-400">Phone: {customer.phone}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Notes</p>
          <p className="text-sm text-slate-200">{appointment.notes ?? "No notes captured yet."}</p>
        </div>

        <section className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Actions</p>
          <div className="flex flex-wrap gap-2">
            {jobHref && (
              <HbButton as={Link} href={jobHref} size="sm" variant="secondary">
                Open job
              </HbButton>
            )}
            {phoneAgentHref && (
              <HbButton as={Link} href={phoneAgentHref} size="sm" variant="ghost">
                Open phone agent
              </HbButton>
            )}
            <HbButton as={Link} href="/appointments" size="sm" variant="ghost">
              Back to appointments
            </HbButton>
          </div>
        </section>
      </HbCard>
    </div>
  );
}
