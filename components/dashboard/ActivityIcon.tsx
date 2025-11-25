import type { ReactElement } from "react";

export type ActivityEventType = "call" | "message" | "quote" | "invoice" | "appointment";

const ACTIVITY_ICON_PATHS: Record<ActivityEventType, ReactElement> = {
  call: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3 5.18 2 2 0 0 1 5 3h3a2 2 0 0 1 2 1.72 12.12 12.12 0 0 0 .7 2.81 2 2 0 0 1-.45 2L9.13 11a16 16 0 0 0 6.77 6.77l1.48-1.48a2 2 0 0 1 2-.45 12.12 12.12 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  message: (
    <path d="M3 11.5a8.5 8.5 0 0 1 8.5-8.5h6a8.5 8.5 0 0 1 8.5 8.5 8.5 8.5 0 0 1-8.5 8.5H13l-4 4V19.5A8.5 8.5 0 0 1 3 11.5z" />
  ),
  quote: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16l4-4h6a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" />
      <path d="M14 2v6h6M10 14h4M10 18h6" />
    </>
  ),
  invoice: (
    <>
      <path d="M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8l-4 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M16 3v4M4 9h16" />
    </>
  ),
  appointment: (
    <>
      <path d="M3 8h18M7 2v6M17 2v6M5 22h14a2 2 0 0 0 2-2V10H3v10a2 2 0 0 0 2 2z" />
    </>
  ),
};

export type ActivityEvent = {
  id: string;
  type: ActivityEventType;
  timestamp: string | null;
  description: string;
  jobId?: string | null;
  customerId?: string | null;
};

export function getActivityLink(event: ActivityEvent) {
  if (event.type === "call") {
    return `/calls/${event.id}`;
  }
  if (event.type === "message") {
    return event.customerId ? `/inbox?customer_id=${event.customerId}` : "/inbox";
  }
  return event.jobId ? `/jobs/${event.jobId}?tab=timeline` : "/jobs?tab=timeline";
}

export function ActivityIcon({ type }: { type: ActivityEventType }) {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-slate-200">
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ACTIVITY_ICON_PATHS[type]}
      </svg>
    </span>
  );
}
