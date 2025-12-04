export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type FilterRange = "today" | "tomorrow" | "this-week" | "next-7" | "upcoming";

const FILTER_OPTIONS: Array<{ key: FilterRange; label: string }> = [
  { key: "today", label: "Today" },
  { key: "next-7", label: "Next 7 days" },
  { key: "upcoming", label: "All upcoming" },
];

const QUICK_FILTERS: Array<{ key: FilterRange; label: string }> = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "this-week", label: "This week" },
];

const ALL_RANGE_OPTIONS: FilterRange[] = ["today", "tomorrow", "this-week", "next-7", "upcoming"];

type AppointmentRow = {
  id: string;
  workspace_id: string;
  job_id: string | null;
  title: string | null;
  notes: string | null;
  location: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  job?: {
    id: string | null;
    title: string | null;
    customer_id: string | null;
    customers?: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
  } | null;
};

function startOfToday(date?: Date) {
  const base = date ? new Date(date) : new Date();
  base.setHours(0, 0, 0, 0);
  base.setMilliseconds(0);
  return base;
}

function endOfWeek(date: Date) {
  const end = new Date(date);
  const day = end.getDay();
  const daysToEnd = 6 - day;
  end.setDate(end.getDate() + daysToEnd + 1);
  return end;
}

function formatDateLabel(value: string | null) {
  if (!value) {
    return "Date TBD";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Date TBD";
  }
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function appointmentStatusLabel(status: string | null) {
  if (!status) {
    return "Scheduled";
  }
  if (status === "cancelled" || status === "canceled") {
    return "Canceled";
  }
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function appointmentStatusClass(status: string | null) {
  if (status === "completed") {
    return "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  }
  if (status === "cancelled" || status === "canceled") {
    return "border border-rose-500/40 bg-rose-500/10 text-rose-200";
  }
  return "border border-amber-500/40 bg-amber-500/10 text-amber-200";
}

function formatTimeLabel(value: string | null) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  return parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeRange(start: string | null, end: string | null) {
  const startLabel = formatTimeLabel(start);
  if (!end) {
    return startLabel;
  }
  const endLabel = formatTimeLabel(end);
  return `${startLabel} — ${endLabel}`;
}

function shortId(value: string | null) {
  if (!value) {
    return "—";
  }
  return value.slice(0, 8);
}

function buildRangeHref(range: FilterRange, includePast: boolean) {
  const params = new URLSearchParams();
  params.set("range", range);
  if (includePast) {
    params.set("showPast", "1");
  }
  return `/appointments?${params.toString()}`;
}

export default async function AppointmentsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await searchParamsPromise;
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

  const rawRange = searchParams?.range;
  const requestedRange = Array.isArray(rawRange) ? rawRange[0] : rawRange;
  const activeRange: FilterRange = ALL_RANGE_OPTIONS.includes(requestedRange as FilterRange)
    ? (requestedRange as FilterRange)
    : "today";
  const showPast = searchParams?.showPast === "1";

  const todayStart = startOfToday();
  let rangeStart = todayStart;
  let rangeEnd: Date | null = null;
  if (activeRange === "today") {
    rangeEnd = new Date(todayStart);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
  } else if (activeRange === "tomorrow") {
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    rangeStart = tomorrow;
    rangeEnd = new Date(tomorrow);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
  } else if (activeRange === "this-week") {
    rangeEnd = endOfWeek(todayStart);
  } else if (activeRange === "next-7") {
    rangeEnd = new Date(todayStart);
    rangeEnd.setDate(rangeEnd.getDate() + 7);
  }
  const rangeStartIso = rangeStart.toISOString();
  const rangeEndIso = rangeEnd ? rangeEnd.toISOString() : null;

  let appointments: AppointmentRow[] = [];
  let appointmentsError: unknown = null;

  try {
    let query = supabase
      .from("appointments")
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
            customer_id,
            customers (
              id,
              name
            )
          )
        `
      )
      .eq("workspace_id", workspace.id)
      .gte("start_time", rangeStartIso)
      .order("start_time", { ascending: true })
      .limit(100);

    if (rangeEndIso) {
      query = query.lt("start_time", rangeEndIso);
    }

    const { data, error } = await query;
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

  let pastAppointments: AppointmentRow[] = [];
  let pastAppointmentsError: unknown = null;

  if (showPast) {
    try {
      const { data, error } = await supabase
        .from("appointments")
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
              customer_id,
              customers (
                id,
                name
              )
            )
          `
        )
        .eq("workspace_id", workspace.id)
        .lt("start_time", rangeStartIso)
        .order("start_time", { ascending: false })
        .limit(50);

      if (error) {
        console.error("[appointments] Failed to load past appointments:", error);
        pastAppointmentsError = error;
      } else {
        pastAppointments = (data ?? []) as AppointmentRow[];
      }
    } catch (error) {
      console.error("[appointments] Failed to load past appointments:", error);
      pastAppointmentsError = error;
    }
  }

  const rangeDescription =
    activeRange === "today"
      ? "Visits happening today"
      : activeRange === "tomorrow"
      ? "Visits scheduled for tomorrow"
      : activeRange === "this-week"
      ? "Visits scheduled for this week"
      : activeRange === "next-7"
      ? "Visits scheduled for the next 7 days"
    : "All upcoming work";
  const historyToggleHref = showPast
    ? buildRangeHref(activeRange, false)
    : buildRangeHref(activeRange, true);
  const historyToggleLabel = showPast ? "Hide past appointments" : "Show past appointments";
  const now = new Date();
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const allUpcomingHref = buildRangeHref("upcoming", showPast);
  const emptyStateHeading = activeRange === "today" ? "No visits today" : "No appointments scheduled";
  const emptyStateMessage =
    activeRange === "today" ? (
      <>
        No visits today. Check{" "}
        <Link href={allUpcomingHref} className="font-semibold text-slate-100 hover:text-slate-50">
          All upcoming
        </Link>{" "}
        or schedule from a job.
      </>
    ) : (
      "Create a visit to help keep your crew and customers aligned."
    );

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Appointments</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Appointments</h1>
          <p className="hb-muted text-sm">Upcoming visits and scheduled work.</p>
        </div>
        <HbButton as={Link} href="/appointments/new" size="sm" variant="secondary">
          New appointment
        </HbButton>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {QUICK_FILTERS.map((option) => {
          const isActive = option.key === activeRange;
          return (
            <Link
              key={`quick-${option.key}`}
              href={buildRangeHref(option.key, showPast)}
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                isActive
                  ? "bg-slate-50 text-slate-950 shadow-sm shadow-slate-900/40"
                  : "text-slate-400 hover:text-slate-100"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-fit flex-wrap items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900/60 px-1 py-1">
          {FILTER_OPTIONS.map((option) => {
            const isActive = option.key === activeRange;
            return (
              <Link
                key={option.key}
                href={buildRangeHref(option.key, showPast)}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                  isActive
                    ? "bg-slate-50 text-slate-950 shadow-sm shadow-slate-900/40"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-slate-500">
          <span>{rangeDescription}</span>
          <Link href={historyToggleHref} className="text-slate-400 hover:text-slate-100">
            {historyToggleLabel}
          </Link>
        </div>
      </div>

      {appointmentsError ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">Something went wrong</h2>
          <p className="hb-muted text-sm">We couldn’t load this page. Try refreshing or come back later.</p>
        </HbCard>
      ) : appointments.length === 0 ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">{emptyStateHeading}</h2>
          <p className="hb-muted text-sm">{emptyStateMessage}</p>
          <div className="flex flex-wrap gap-2">
            <HbButton as={Link} href="/appointments/new">
              Schedule an appointment
            </HbButton>
            {activeRange === "today" && (
              <Link
                href={allUpcomingHref}
                className="text-xs uppercase tracking-[0.3em] text-slate-400 transition hover:text-slate-100"
              >
                View all upcoming
              </Link>
            )}
          </div>
        </HbCard>
      ) : (
        <HbCard className="space-y-4">
          <div className="grid gap-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
            <span>Date</span>
            <span>Time range</span>
            <span>Customer</span>
            <span>Job</span>
            <span>Status</span>
          </div>

          <div className="space-y-2">
            {appointments.map((appt) => {
              const jobCustomer =
                appt.job?.customers && Array.isArray(appt.job.customers)
                  ? appt.job.customers[0] ?? null
                  : (appt.job?.customers ?? null);
              const customerName = jobCustomer?.name ?? shortId(jobCustomer?.id ?? null);
              const fallbackCustomer =
                !jobCustomer && appt.job?.customer_id ? `Customer ${shortId(appt.job.customer_id)}` : null;
              const customerDisplay = customerName !== "—" ? customerName : fallbackCustomer ?? "Customer TBD";
              const jobDisplay = appt.job?.title ?? appt.title ?? `Visit ${shortId(appt.id)}`;
              const jobIdLabel =
                appt.job?.id ?? appt.job_id
                  ? `Job ${shortId(appt.job?.id ?? appt.job_id)}`
                  : `Visit ${shortId(appt.id)}`;
              const startDate = appt.start_time ? new Date(appt.start_time) : null;
              const endDate = appt.end_time ? new Date(appt.end_time) : null;
              const isToday =
                startDate && startDate >= todayStart && startDate < tomorrowStart;
              const inProgress =
                startDate && startDate <= now && (!endDate || now <= endDate);
              const highlightClass = isToday || inProgress ? "border-slate-500/60 bg-slate-900/80 ring-1 ring-amber-400/30" : "";

              return (
                <Link
                  key={appt.id}
                  href={`/appointments/${appt.id}`}
                  className={`group grid gap-3 rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-3 transition hover:border-slate-600 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] ${highlightClass}`}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-100">
                      {formatDateLabel(appt.start_time)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {appt.location ?? "Location TBD"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">
                      {formatTimeRange(appt.start_time, appt.end_time)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{customerDisplay}</p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">{`Customer`}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-100">{jobDisplay}</p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">{jobIdLabel}</p>
                    {appt.notes && (
                      <p className="text-[11px] text-slate-400 max-w-[18rem] truncate">
                        {appt.notes}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-sm font-semibold text-slate-100">
                      {appt.status ?? "scheduled"}
                    </p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Status</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </HbCard>
      )}
      {showPast && (
        <HbCard className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Past visits</p>
              <h2 className="hb-heading-3 text-xl font-semibold">History</h2>
            </div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Showing most recent</p>
          </div>
          {pastAppointmentsError ? (
            <p className="text-sm text-slate-400">Something went wrong loading past visits.</p>
          ) : pastAppointments.length === 0 ? (
            <p className="text-sm text-slate-400">No past appointments available for this range.</p>
          ) : (
            <div className="space-y-2">
              {pastAppointments.map((appt) => {
                const jobTitle = appt.job?.title ?? appt.title ?? `Visit ${shortId(appt.id)}`;
                return (
                  <Link
                    key={`past-${appt.id}`}
                    href={`/appointments/${appt.id}`}
                    className="group flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 transition hover:border-slate-600 hover:bg-slate-900"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{formatDateLabel(appt.start_time)}</p>
                      <p className="text-xs text-slate-400">
                        {formatTimeRange(appt.start_time, appt.end_time)} · {jobTitle}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.3em] font-semibold ${appointmentStatusClass(
                        appt.status,
                      )}`}
                    >
                      {appointmentStatusLabel(appt.status)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </HbCard>
      )}
    </div>
  );
}
