export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import { formatFriendlyDateTime, DEFAULT_TIMEZONE } from "@/utils/dashboard/time";
import {
  buildJobRelatedSubtitle,
  buildClearFilterHref,
  buildFilterHref,
  formatRelativeTimeLabel,
  getJobsEmptyStateVariant,
  getStatusBadgeMeta,
  isJobCompletedLast30Days,
  isCompletedJobStatus,
  isOpenJobStatus,
  isScheduledJobStatus,
  jobNeedsVisitScheduled,
  JobsFilterMode,
  JobCustomerRelation,
  resolveJobsFilterMode,
} from "@/lib/domain/jobs/jobListUi";

type JobsPageJobRow = {
  id: string;
  title: string | null;
  status: string | null;
  source: string | null;
  created_at: string | null;
  updated_at: string | null;
  customers: JobCustomerRelation;
};

type JobAppointmentRow = {
  id: string;
  job_id: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
};

type JobQuoteRow = {
  id: string;
  job_id: string | null;
  status: string | null;
  created_at: string | null;
};

type JobsPageSearchParams = {
  [key: string]: string | string[] | undefined;
};

export default async function JobsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<JobsPageSearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  const filterMode = resolveJobsFilterMode(
    searchParams?.filterMode ?? searchParams?.filter,
  );
  const rawSearchQuery = searchParams?.q;
  const normalizedSearchQuery = (
    Array.isArray(rawSearchQuery) ? rawSearchQuery[0] : rawSearchQuery ?? ""
  ).trim();
  const isSearching = normalizedSearchQuery.length > 0;
  const hasActiveFilters = filterMode !== "all";

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[jobs] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[jobs] Failed to resolve user:", error);
    redirect("/");
  }

  if (!user) {
    redirect("/");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[jobs] Failed to resolve workspace:", error);
    redirect("/");
  }

  if (!workspace) {
    redirect("/");
  }

  const now = new Date();

  let jobs: JobsPageJobRow[] = [];
  let jobsError: unknown = null;
  try {
    const { data, error } = await supabase
      .from("jobs")
      .select(
        `
          id,
          title,
          status,
          source,
          created_at,
          updated_at,
          customers (
            id,
            name
          )
        `,
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false, nulls: "last" })
      .limit(50);

    if (error) {
      console.error("[jobs] Failed to load jobs:", error);
      jobsError = error;
    } else {
      jobs = (data ?? []) as JobsPageJobRow[];
    }
  } catch (error) {
    console.error("[jobs] Failed to load jobs:", error);
    jobsError = error;
  }

  let upcomingAppointments: JobAppointmentRow[] = [];
  let quoteRows: JobQuoteRow[] = [];
  if (!jobsError && jobs.length > 0) {
    const jobIds = jobs.map((job) => job.id);
    try {
      const { data, error } = await supabase
        .from<JobAppointmentRow>("appointments")
        .select("id, job_id, start_time, end_time, status")
        .eq("workspace_id", workspace.id)
        .in("job_id", jobIds)
        .gte("start_time", now.toISOString())
        .order("start_time", { ascending: true })
        .limit(jobIds.length * 3);

      if (error) {
        console.error("[jobs] Failed to load appointments:", error);
      } else {
        upcomingAppointments = data ?? [];
      }
    } catch (error) {
      console.error("[jobs] Appointment query failed:", error);
    }

    try {
      const { data, error } = await supabase
        .from<JobQuoteRow>("quotes")
        .select("id, job_id, status, created_at")
        .eq("workspace_id", workspace.id)
        .in("job_id", jobIds)
        .order("created_at", { ascending: false })
        .limit(Math.max(jobIds.length * 3, 100));

      if (error) {
        console.error("[jobs] Failed to load quotes:", error);
      } else {
        quoteRows = data ?? [];
      }
    } catch (error) {
      console.error("[jobs] Quote query failed:", error);
    }
  }

  const appointmentByJob = new Map<string, JobAppointmentRow>();
  for (const appointment of upcomingAppointments) {
    if (!appointment.job_id || !appointment.start_time) {
      continue;
    }
    if (!appointmentByJob.has(appointment.job_id)) {
      appointmentByJob.set(appointment.job_id, appointment);
    }
  }

  const quoteByJob = new Map<string, JobQuoteRow>();
  for (const quote of quoteRows) {
    if (!quote.job_id || !quote.created_at) {
      continue;
    }
    if (!quoteByJob.has(quote.job_id)) {
      quoteByJob.set(quote.job_id, quote);
    }
  }

  const totalJobs = jobs.length;
  const hasAnyJobsInWorkspace = totalJobs > 0;
  const openJobsCount = jobs.reduce(
    (count, job) => (isOpenJobStatus(job.status) ? count + 1 : count),
    0,
  );

  const completedLast30DaysCount = jobs.reduce(
    (count, job) =>
      isJobCompletedLast30Days({
        status: job.status,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        now,
      })
        ? count + 1
        : count,
    0,
  );

  const appointmentJobIds = new Set(appointmentByJob.keys());
  const scheduledJobsCount =
    appointmentJobIds.size > 0
      ? appointmentJobIds.size
      : jobs.reduce(
          (count, job) => (isScheduledJobStatus(job.status) ? count + 1 : count),
          0,
        );

  const visibleJobs = jobs.filter((job) => {
    switch (filterMode) {
      case "open":
        return isOpenJobStatus(job.status);
      case "scheduled":
        return (
          appointmentByJob.has(job.id) || isScheduledJobStatus(job.status)
        );
      case "completed":
        return isCompletedJobStatus(job.status);
      default:
        return true;
    }
  });

  const needsVisitMap = new Map<string, boolean>();
  const visitNeededJobIds: string[] = [];
  for (const job of visibleJobs) {
    const needsVisit = jobNeedsVisitScheduled({
      status: job.status,
      hasUpcomingAppointment: appointmentByJob.has(job.id),
    });
    needsVisitMap.set(job.id, needsVisit);
    if (needsVisit) {
      visitNeededJobIds.push(job.id);
    }
  }
  const jobsWithVisitNeededCount = visitNeededJobIds.length;
  const visitNeededJobSample = visitNeededJobIds.slice(0, 5);

  console.log("[jobs-index-summary]", {
    workspaceId: workspace.id,
    totalJobs,
    openJobsCount,
    scheduledJobsCount,
    completedLast30DaysCount,
    filterMode,
    visibleJobsCount: visibleJobs.length,
    jobsWithVisitNeededCount,
    visitNeededJobSample,
  });

  const filterOptions: Array<{ label: string; mode: JobsFilterMode }> = [
    { label: "All", mode: "all" },
    { label: "Open", mode: "open" },
    { label: "Scheduled", mode: "scheduled" },
    { label: "Completed", mode: "completed" },
  ];

  const clearFilterHref = buildClearFilterHref(searchParams);
  const emptyStateVariant = getJobsEmptyStateVariant({
    hasAnyJobsInWorkspace,
    visibleJobsCount: visibleJobs.length,
    hasActiveFilters,
    isSearching,
  });

  console.log("[jobs-index-empty-state]", {
    workspaceId: workspace.id,
    hasAnyJobsInWorkspace,
    isSearching,
    hasActiveFilters,
    visibleJobsCount: visibleJobs.length,
    emptyStateVariant,
  });

  const buildTimingCopy = (job: JobsPageJobRow) => {
    const quote = quoteByJob.get(job.id);
    if (quote) {
      const label =
        quote.status?.toLowerCase() === "sent" ? "Quote sent" : "Quote created";
      const relative = formatRelativeTimeLabel(quote.created_at, now);
      return relative ? `${label} ${relative}` : label;
    }

    const appointment = appointmentByJob.get(job.id);
    if (appointment && appointment.start_time) {
      const friendly = formatFriendlyDateTime(
        appointment.start_time,
        appointment.end_time,
        DEFAULT_TIMEZONE,
      );
      return `Next visit ${friendly}`;
    }

    const updatedRelative = formatRelativeTimeLabel(
      job.updated_at ?? job.created_at,
      now,
    );
    if (updatedRelative) {
      return `Updated ${updatedRelative}`;
    }
    return "Updated recently";
  };

  const hasJobs = hasAnyJobsInWorkspace;

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Jobs</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Jobs</h1>
          <p className="hb-muted text-sm">
            Track leads and active work so you always know what needs attention next.
          </p>
        </div>
        <HbButton as={Link} href="/jobs/new" size="sm" variant="secondary">
          New job
        </HbButton>
      </header>

      {hasJobs && (
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Open jobs", value: openJobsCount },
            { label: "Scheduled visits", value: scheduledJobsCount },
            { label: "Completed last 30 days", value: completedLast30DaysCount },
          ].map((metric) => (
            <span
              key={metric.label}
              className="inline-flex items-center rounded-full border border-slate-800/60 bg-slate-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-200"
            >
              {metric.label} · {metric.value}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {filterOptions.map((filter) => {
          const active = filter.mode === filterMode;
          const baseChip =
            "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em]";
          const variantChip = active
            ? "border-slate-500 bg-slate-900 text-slate-100"
            : "border-slate-800/60 bg-slate-950/40 text-slate-400 hover:border-slate-600";
          return (
            <Link
              key={filter.mode}
              href={buildFilterHref(filter.mode, searchParams)}
              className={`${baseChip} ${variantChip}`}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      {jobsError ? (
        <HbCard className="space-y-2">
          <h2 className="hb-card-heading text-lg font-semibold">Something went wrong</h2>
          <p className="hb-muted text-sm">We couldn’t load this page. Try again or go back.</p>
        </HbCard>
      ) : emptyStateVariant === "brand-new" ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">Track work from lead to invoice</h2>
          <p className="hb-muted text-sm">
            Capture requests, schedule visits, and keep every customer interaction in one place.
          </p>
          <p className="hb-muted text-sm">
            Start by adding a job for a recent customer visit or new lead.
          </p>
          <HbButton as={Link} href="/jobs/new">
            Create your first job
          </HbButton>
        </HbCard>
      ) : emptyStateVariant === "filters" ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">No jobs match this filter</h2>
          <p className="hb-muted text-sm">
            Try switching back to “All” or widening the search so more jobs appear.
          </p>
          <HbButton as={Link} href={clearFilterHref} size="sm" variant="ghost">
            Clear filters
          </HbButton>
        </HbCard>
      ) : (
        <HbCard className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="hb-card-heading text-lg font-semibold">All jobs</h2>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Showing {visibleJobs.length} of {totalJobs} job
              {totalJobs === 1 ? "" : "s"}
            </p>
          </div>
          <div className="space-y-3">
            {visibleJobs.map((job) => {
              const statusMeta = getStatusBadgeMeta(job.status);
              const timingCopy = buildTimingCopy(job);
              const relatedSubtitle = buildJobRelatedSubtitle({ job });
              const needsVisit = needsVisitMap.get(job.id) ?? false;
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="group block rounded-2xl border border-slate-800/60 bg-slate-950/40 px-4 py-4 transition hover:border-slate-600"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-slate-100">
                        {job.title ?? "Untitled job"}
                      </p>
                      <p className="text-sm text-slate-400">{relatedSubtitle}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.3em] ${statusMeta.className}`}
                      >
                        {statusMeta.label}
                      </span>
                      {needsVisit && (
                        <span className="inline-flex items-center rounded-full border border-slate-700/60 bg-slate-900/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-300">
                          Needs visit scheduled
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{timingCopy}</p>
                </Link>
              );
            })}
          </div>
        </HbCard>
      )}
    </div>
  );
}
