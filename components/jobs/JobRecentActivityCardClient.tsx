"use client";

import { useState } from "react";

import HbCard from "@/components/ui/hb-card";
import { formatFriendlyDateTime } from "@/utils/timeline/formatters";
import type { TimelineEvent, TimelineEventType } from "@/types/ai";

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

const MAX_COLLAPSED_EVENTS = 3;

type Props = {
  events: TimelineEvent[];
  loadError: boolean;
};

const ASKBOB_SCRIPT_LABEL = "AskBob";

export default function JobRecentActivityCardClient({ events, loadError }: Props) {
  const [expanded, setExpanded] = useState(false);
  const displayedEvents = expanded ? events : events.slice(0, MAX_COLLAPSED_EVENTS);
  const hasMoreEvents = events.length > MAX_COLLAPSED_EVENTS;
  const toggleLabel = expanded ? "Hide activity" : "Show activity";

  return (
    <HbCard className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Recent activity</p>
          <h2 className="hb-heading-3 text-xl font-semibold">Latest job history</h2>
          <p className="text-sm text-slate-400">
            Latest calls, messages, quotes, and other events for this job.
          </p>
        </div>
        <button
          type="button"
          className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400 transition hover:text-slate-200"
          onClick={() => setExpanded((value) => !value)}
        >
          {toggleLabel}
        </button>
      </div>
      {loadError ? (
        <p className="text-sm text-slate-400">
          Something went wrong loading recent activity. Try refreshing the page.
        </p>
      ) : !events.length ? (
        <p className="text-sm text-slate-400">No recent activity recorded for this job yet.</p>
      ) : (
        <div className="space-y-3">
          {displayedEvents.map((event, index) => {
            const label = EVENT_LABELS[event.type] ?? event.type;
            const timestampLabel = formatFriendlyDateTime(event.timestamp, "—");
            const isAskBobScript = Boolean(event.askBobScript);
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
                    {isAskBobScript && (
                      <span className="rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.35em] text-emerald-200">
                        {ASKBOB_SCRIPT_LABEL}
                      </span>
                    )}
                    {event.status && <span>{event.status}</span>}
                  </div>
                  <p className="font-semibold text-slate-100">{event.title}</p>
                  {event.detail && <p className="text-xs text-slate-400">{event.detail}</p>}
                </div>
                <span className="text-xs text-slate-500">{timestampLabel}</span>
              </div>
            );
          })}
          {!expanded && hasMoreEvents && (
            <div className="flex justify-end">
              <button
                type="button"
                className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 transition hover:text-slate-200"
                onClick={() => setExpanded(true)}
              >
                View all activity
              </button>
            </div>
          )}
        </div>
      )}
    </HbCard>
  );
}
