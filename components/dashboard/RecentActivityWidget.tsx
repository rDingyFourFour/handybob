"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/utils/supabase/client";
import { formatFriendlyDateTime } from "@/utils/dashboard/time";
import { ActivityIcon, ActivityEvent, ActivityEventType, getActivityLink } from "./ActivityIcon";

export function RecentActivityWidget({
  workspaceId,
  workspaceTimeZone,
  maxItems = 5,
}: {
  workspaceId: string;
  workspaceTimeZone?: string | null;
  maxItems?: number;
}) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const supabaseClient = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!workspaceId) return;

    let canceled = false;

    const loadEvents = async () => {
      setStatus("loading");
      setErrorMessage(null);

      try {
        const [appointments, calls, messages, quotes, invoices] = await Promise.all([
          supabaseClient
            .from("appointments")
            .select("id, job_id, title, start_time")
            .eq("workspace_id", workspaceId)
            .order("start_time", { ascending: false })
            .limit(maxItems),
          supabaseClient
            .from("calls")
            .select("id, job_id, created_at, status")
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: false })
            .limit(maxItems),
          supabaseClient
            .from("messages")
            .select("id, job_id, customer_id, created_at, subject, direction")
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: false })
            .limit(maxItems),
          supabaseClient
            .from("quotes")
            .select("id, job_id, created_at, total, status")
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: false })
            .limit(maxItems),
          supabaseClient
            .from("invoices")
            .select("id, job_id, created_at, total, status")
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: false })
            .limit(maxItems),
        ]);

        if (canceled) return;

        const events: ActivityEvent[] = [
          ...((appointments.data ?? []) as { id: string; job_id: string | null; title: string | null; start_time: string | null }[]).map((row) => ({
            id: row.id,
            type: "appointment" as ActivityEventType,
            timestamp: row.start_time,
            description: row.title ? `Appointment: ${row.title}` : "Appointment scheduled",
            jobId: row.job_id,
          })),
          ...((calls.data ?? []) as { id: string; job_id: string | null; created_at: string | null; status: string | null }[]).map((row) => ({
            id: row.id,
            type: "call" as ActivityEventType,
            timestamp: row.created_at,
            description: `Call ${row.status ?? ""}`.trim() || "Call logged",
            jobId: row.job_id,
          })),
          ...((messages.data ?? []) as { id: string; job_id: string | null; customer_id?: string | null; created_at: string | null; subject: string | null }[]).map((row) => ({
            id: row.id,
            type: "message" as ActivityEventType,
            timestamp: row.created_at,
            description: row.subject ? `Message: ${row.subject}` : "New message",
            jobId: row.job_id,
            customerId: row.customer_id,
          })),
          ...((quotes.data ?? []) as { id: string; job_id: string | null; created_at: string | null; status: string | null }[]).map((row) => ({
            id: row.id,
            type: "quote" as ActivityEventType,
            timestamp: row.created_at,
            description: `Quote ${row.status ?? ""}`.trim() || "Quote sent",
            jobId: row.job_id,
          })),
          ...((invoices.data ?? []) as { id: string; job_id: string | null; created_at: string | null; status: string | null }[]).map((row) => ({
            id: row.id,
            type: "invoice" as ActivityEventType,
            timestamp: row.created_at,
            description: `Invoice ${row.status ?? ""}`.trim() || "Invoice created",
            jobId: row.job_id,
          })),
        ]
          .filter((event) => event.timestamp)
          .sort((a, b) => {
            const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return bTime - aTime;
          })
          .slice(0, maxItems);

        setEvents(events);
        setStatus("idle");
      } catch {
        if (canceled) return;
        setErrorMessage("Unable to load recent activity right now.");
        setStatus("error");
      }
    };

    void loadEvents();

    return () => {
      canceled = true;
    };
  }, [workspaceId, workspaceTimeZone, maxItems, refreshIndex, supabaseClient]);

  const retry = () => setRefreshIndex((value) => value + 1);

  if (status === "error") {
    return (
      <div className="rounded border border-slate-800 px-3 py-3 text-sm text-slate-300">
        <p className="text-sm text-slate-200">{errorMessage || "Unable to load recent activity right now."}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-2 text-[11px] text-slate-400 hover:text-slate-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!events.length) {
    return <p className="hb-muted text-sm">No activity recorded yet.</p>;
  }

  return (
    <div className="space-y-2">
      {events.map((event) => {
        const eventHref = getActivityLink(event);
        const eventTime = formatFriendlyDateTime(event.timestamp, null, workspaceTimeZone ?? undefined);
        return (
          <Link
            key={`${event.type}-${event.id}`}
            href={eventHref}
            className="flex items-center justify-between gap-3 rounded border border-slate-800 px-3 py-2 text-sm hover:border-slate-600"
          >
            <div className="flex items-center gap-3">
              <ActivityIcon type={event.type} />
              <div>
                <p className="font-semibold text-slate-100">{event.description}</p>
                <p className="text-[11px] text-slate-500">{eventTime || "—"}</p>
              </div>
            </div>
            <span className="text-[11px] uppercase text-slate-500">Timeline</span>
          </Link>
        );
      })}
    </div>
  );
}
