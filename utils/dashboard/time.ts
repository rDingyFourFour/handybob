const DEFAULT_TIMEZONE =
  process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE ||
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  "UTC";

function getDateKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatTimeRange(startDate: Date, endDate: Date | null, timezone: string) {
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  const startLabel = timeFormatter.format(startDate);
  if (!endDate) return startLabel;
  const sameDay = getDateKey(startDate, timezone) === getDateKey(endDate, timezone);
  const endLabel = timeFormatter.format(endDate);
  return sameDay ? `${startLabel}–${endLabel}` : startLabel;
}

export function formatFriendlyDateTime(
  start: string | null,
  end: string | null,
  timezone: string | undefined = DEFAULT_TIMEZONE
) {
  if (!start) return "";
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  const rangeLabel = formatTimeRange(startDate, endDate, timezone);
  const startKey = getDateKey(startDate, timezone);
  const now = new Date();
  const todayKey = getDateKey(now, timezone);
  const tomorrowKey = getDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000), timezone);

  if (startKey === todayKey) {
    return `Today at ${rangeLabel}`;
  }
  if (startKey === tomorrowKey) {
    return `Tomorrow at ${rangeLabel}`;
  }

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).format(startDate);
  return `${weekday} · ${rangeLabel}`;
}

export function daysSince(date: string | null) {
  if (!date) return null;
  const now = Date.now();
  const then = new Date(date).getTime();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}

export function formatRelativeMinutesAgo(date: string | null) {
  if (!date) return "";
  const diffMinutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (diffMinutes <= 0) return "Received just now";
  if (diffMinutes < 60) {
    return `Received ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }
  const hours = Math.floor(diffMinutes / 60);
  return `Received ${hours} hour${hours === 1 ? "" : "s"} ago`;
}

export { DEFAULT_TIMEZONE };
