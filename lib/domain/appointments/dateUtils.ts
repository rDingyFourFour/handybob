import { DEFAULT_TIMEZONE } from "@/utils/dashboard/time";

export type AppointmentStatus =
  | "scheduled"
  | "rescheduled"
  | "completed"
  | "cancelled"
  | "canceled"
  | "no_show";

export const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = ["scheduled", "rescheduled"];

const ALL_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  "scheduled",
  "rescheduled",
  "completed",
  "cancelled",
  "canceled",
  "no_show",
];

function formatDateKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseStartTime(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeStatus(value?: string | null): AppointmentStatus | null {
  if (!value) {
    return null;
  }
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return null;
  return (ALL_APPOINTMENT_STATUSES.includes(cleaned as AppointmentStatus)
    ? (cleaned as AppointmentStatus)
    : null);
}

export function normalizeAppointmentStatus(status?: string | null): AppointmentStatus | null {
  return normalizeStatus(status);
}

export function isSameCalendarDay(dateA: Date, dateB: Date, timezone: string) {
  return formatDateKey(dateA, timezone) === formatDateKey(dateB, timezone);
}

export function isTodayAppointment(
  startTime: string | Date | null | undefined,
  now: Date,
  timezone: string = DEFAULT_TIMEZONE,
  status?: string | null
) {
  const normalizedStatus = normalizeAppointmentStatus(status);
  if (!normalizedStatus) {
    return false;
  }
  if (!ACTIVE_APPOINTMENT_STATUSES.includes(normalizedStatus)) {
    return false;
  }
  const parsed = parseStartTime(startTime);
  if (!parsed) {
    return false;
  }
  return isSameCalendarDay(parsed, now, timezone);
}
