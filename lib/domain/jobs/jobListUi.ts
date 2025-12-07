import { formatFriendlyDateTime, DEFAULT_TIMEZONE } from "@/utils/dashboard/time";

type SearchParamsRecord = {
  [key: string]: string | string[] | undefined;
};

export type JobsFilterMode = "all" | "open" | "scheduled" | "completed";

export type JobCustomerRelation =
  | { id: string | null; name: string | null }
  | Array<{ id: string | null; name: string | null }>
  | null
  | undefined;

const COMPLETED_STATUSES = new Set(["completed", "complete", "closed", "done"]);
const CANCELED_STATUSES = new Set(["cancelled", "canceled"]);
const SCHEDULED_STATUSES = new Set(["scheduled", "in_progress", "in-progress"]);

const STATUS_BADGE_META: Record<
  string,
  { label: string; className: string }
> = {
  completed: {
    label: "Completed",
    className: "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  },
  complete: {
    label: "Completed",
    className: "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  },
  closed: {
    label: "Closed",
    className: "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  },
  canceled: {
    label: "Canceled",
    className: "border border-rose-500/40 bg-rose-500/10 text-rose-200",
  },
  cancelled: {
    label: "Canceled",
    className: "border border-rose-500/40 bg-rose-500/10 text-rose-200",
  },
  scheduled: {
    label: "Scheduled",
    className: "border border-amber-500/40 bg-amber-500/10 text-amber-200",
  },
  in_progress: {
    label: "In progress",
    className: "border border-sky-500/40 bg-sky-500/10 text-sky-200",
  },
  quoted: {
    label: "Quoted",
    className: "border border-indigo-500/40 bg-indigo-500/10 text-indigo-200",
  },
  open: {
    label: "Open",
    className: "border border-slate-700 bg-slate-900/60 text-slate-100",
  },
};

const DEFAULT_STATUS_BADGE = {
  label: "Status",
  className: "border border-slate-700 bg-slate-900/40 text-slate-100",
};

const FILTER_PARAM_KEYS = new Set(["filterMode", "filter"]);

function normalizeStatus(status: string | null | undefined): string {
  return status?.trim().toLowerCase() ?? "";
}

export function isCompletedJobStatus(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  return COMPLETED_STATUSES.has(normalized) || CANCELED_STATUSES.has(normalized);
}

export function isOpenJobStatus(status: string | null | undefined) {
  return !isCompletedJobStatus(status);
}

export function isScheduledJobStatus(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  return SCHEDULED_STATUSES.has(normalized);
}

export function getStatusBadgeMeta(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  return STATUS_BADGE_META[normalized] ?? {
    label: formatStatusLabel(status),
    className: DEFAULT_STATUS_BADGE.className,
  };
}

export function formatStatusLabel(status: string | null | undefined) {
  if (!status) return DEFAULT_STATUS_BADGE.label;
  const normalized = normalizeStatus(status);
  if (!normalized) {
    return DEFAULT_STATUS_BADGE.label;
  }
  return normalized
    .split(/[\s_-]+/)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(" ");
}

export function resolveJobsFilterMode(raw?: string | string[] | undefined): JobsFilterMode {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "open" || value === "scheduled" || value === "completed") {
    return value;
  }
  return "all";
}

export function buildJobRelatedSubtitle({
  job,
  customerName,
  timezone = DEFAULT_TIMEZONE,
}: {
  job: {
    updated_at?: string | null;
    created_at?: string | null;
    customers?: JobCustomerRelation;
  };
  customerName?: string | null;
  timezone?: string;
}) {
  const name = customerName ?? getFirstCustomerName(job.customers);
  const timestamp = job.updated_at ?? job.created_at;
  const formattedDate =
    timestamp?.trim()
      ? formatFriendlyDateTime(timestamp, null, timezone).trim()
      : "";
  const prefix = name ? `Customer • ${name}` : "Job";
  const suffix =
    formattedDate.length > 0 ? `${name ? "Updated" : "Created"} ${formattedDate}` : "";
  return suffix ? `${prefix} · ${suffix}` : prefix;
}

export function jobNeedsVisitScheduled({
  status,
  hasUpcomingAppointment,
  upcomingAppointmentCount,
}: {
  status: string | null | undefined;
  hasUpcomingAppointment?: boolean;
  upcomingAppointmentCount?: number | null;
}) {
  if (!isOpenJobStatus(status)) {
    return false;
  }
  const hasExplicitInfo =
    typeof hasUpcomingAppointment === "boolean" ||
    typeof upcomingAppointmentCount === "number";
  if (!hasExplicitInfo) {
    return false;
  }
  const hasAppointment =
    typeof hasUpcomingAppointment === "boolean"
      ? hasUpcomingAppointment
      : typeof upcomingAppointmentCount === "number"
      ? upcomingAppointmentCount > 0
      : false;
  return !hasAppointment;
}

export function isJobCompletedLast30Days({
  status,
  createdAt,
  updatedAt,
  now,
}: {
  status: string | null | undefined;
  createdAt: string | null | undefined;
  updatedAt: string | null | undefined;
  now: Date;
}) {
  if (!isCompletedJobStatus(status)) {
    return false;
  }
  const completedAtIso = updatedAt ?? createdAt;
  if (!completedAtIso) {
    return false;
  }
  const completedDate = new Date(completedAtIso);
  if (Number.isNaN(completedDate.getTime())) {
    return false;
  }
  const elapsedMs = now.getTime() - completedDate.getTime();
  if (elapsedMs < 0) {
    return false;
  }
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  return elapsedMs <= THIRTY_DAYS_MS;
}

function copySearchParams(params?: SearchParamsRecord) {
  const copied = new URLSearchParams();
  if (!params) {
    return copied;
  }

  for (const [key, value] of Object.entries(params)) {
    if (FILTER_PARAM_KEYS.has(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined) {
          copied.append(key, item);
        }
      });
    } else if (value !== undefined) {
      copied.set(key, value);
    }
  }

  return copied;
}

export function buildFilterHref(
  mode: JobsFilterMode,
  params?: SearchParamsRecord,
  basePath = "/jobs"
) {
  const search = copySearchParams(params);
  if (mode !== "all") {
    search.set("filterMode", mode);
  }
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function buildClearFilterHref(params?: SearchParamsRecord, basePath = "/jobs") {
  return buildFilterHref("all", params, basePath);
}

export function formatRelativeTimeLabel(timestamp: string | null | undefined, now = new Date()) {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = now.getTime() - parsed.getTime();
  if (diffMs < 0) {
    return "Just now";
  }
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 60) {
    return diffMinutes === 0 ? "Just now" : `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export function getFirstCustomerName(customers: JobCustomerRelation) {
  if (!customers) return null;
  if (Array.isArray(customers)) {
    return customers.find((customer) => Boolean(customer?.name))?.name ?? null;
  }
  return customers.name;
}
