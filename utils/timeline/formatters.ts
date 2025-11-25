// Shared helpers for formatting timeline data, currency, and quick snippets.
// This is the single source of truth for event ordering and display used by jobs, customers, and dashboards.
export function formatDateTime(date: string | null | undefined, fallback = "") {
  if (!date) {
    return fallback;
  }

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCurrency(amount: number | null | undefined) {
  const value = Number(amount ?? 0);
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function snippet(
  text: string | null | undefined,
  max = 180,
  fallback: string | null = null
) {
  if (!text) return fallback;
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function sortTimelineEntries<T extends { timestamp?: string | null }>(entries: T[]) {
  return [...entries].sort((a, b) => {
    const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return bTime - aTime;
  });
}
