"use server";

import HbCard from "@/components/ui/hb-card";
import { buildJobTimelinePayload } from "@/lib/domain/jobs";
import { formatFriendlyDateTime } from "@/utils/timeline/formatters";
import type { TimelineEvent, TimelineEventType } from "@/types/ai";

type Props = {
  jobId: string;
  workspaceId: string;
};

const EVENT_LABELS: Record<TimelineEventType, string> = {
  job_created: "Job created",
  job: "Job update",
  message: "Message",
  call: "Call",
  appointment: "Appointment",
  quote: "Quote",
  invoice: "Invoice",
  payment: "Payment",
  customer_created: "Customer",
};

const MAX_EVENTS = 8;

export default async function JobRecentActivityCard({ jobId, workspaceId }: Props) {
  let events: TimelineEvent[] = [];
  let loadError = false;
  try {
    const payload = await buildJobTimelinePayload(jobId, workspaceId);
    events = payload.events.slice(0, MAX_EVENTS);
  } catch (error) {
    console.error("[job-recent-activity] Failed to load timeline", error);
    loadError = true;
  }

  const hasEvents = events.length > 0;

  return (
    <HbCard className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Recent activity</p>
        <h2 className="hb-heading-3 text-xl font-semibold">Latest job history</h2>
        <p className="text-sm text-slate-400">
          Latest calls, messages, quotes, and other events for this job.
        </p>
      </div>
      {loadError ? (
        <p className="text-sm text-slate-400">
          Something went wrong loading recent activity. Try refreshing the page.
        </p>
      ) : !hasEvents ? (
        <p className="text-sm text-slate-400">No recent activity recorded for this job yet.</p>
      ) : (
        <div className="space-y-3">
          {events.map((event, index) => {
            const label = EVENT_LABELS[event.type] ?? event.type;
            const timestampLabel = formatFriendlyDateTime(event.timestamp, "—");
            return (
              <div
                key={`${event.type}-${event.timestamp ?? "none"}-${index}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-200"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.35em] text-slate-500">
                    <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-semibold">
                      {label}
                    </span>
                    {event.status && <span>{event.status}</span>}
                  </div>
                  <p className="font-semibold text-slate-100">{event.title}</p>
                  {event.detail && <p className="text-xs text-slate-400">{event.detail}</p>}
                </div>
                <span className="text-xs text-slate-500">{timestampLabel}</span>
              </div>
            );
          })}
        </div>
      )}
    </HbCard>
  );
}
