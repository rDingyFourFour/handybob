import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/utils/workspaces";
import { processCallRecording } from "../processCallAction";
import { formatDateTime } from "@/utils/timeline/formatters";

type CallRow = {
  id: string;
  direction: string | null;
  status: string | null;
  started_at: string | null;
  created_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  ai_summary?: string | null;
  transcript?: string | null;
  recording_url?: string | null;
  from_number?: string | null;
  to_number?: string | null;
  job_id?: string | null;
  customer_id?: string | null;
  customers?:
    | { id: string; name: string | null; phone: string | null }
    | { id: string; name: string | null; phone: string | null }[]
    | null;
  jobs?:
    | { id: string; title: string | null }
    | { id: string; title: string | null }[]
    | null;
};

export default async function CallDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  const { data: call, error } = await supabase
    .from("calls")
    .select(
      `
        id,
        direction,
        status,
        started_at,
        created_at,
        duration_seconds,
        summary,
        ai_summary,
        transcript,
        recording_url,
        from_number,
        to_number,
        job_id,
        customer_id,
        jobs ( id, title ),
        customers ( id, name, phone )
      `
    )
    .eq("id", params.id)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (error) {
    return (
      <div className="hb-card">
        <p className="text-red-400 text-sm">Failed to load call: {error.message}</p>
      </div>
    );
  }
  if (!call) redirect("/calls");

  const customerRecord = Array.isArray(call.customers) ? call.customers[0] : call.customers;
  const jobRecord = Array.isArray(call.jobs) ? call.jobs[0] : call.jobs;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1>Call detail</h1>
          <p className="hb-muted text-sm">
            {call.direction === "inbound" ? "Inbound" : "Outbound"} · {call.status || "unknown"} ·{" "}
            {formatDateTime(call.created_at || call.started_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/calls" className="hb-button-ghost text-xs">
            Back to calls
          </Link>
          {!call.transcript && call.recording_url && (
            <form action={processCallRecording}>
              <input type="hidden" name="call_id" value={call.id} />
              <button className="hb-button text-xs" type="submit">
                Transcribe & summarize
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="hb-card space-y-2">
        <div className="text-sm text-slate-300">
          From {call.from_number || "Unknown"} → {call.to_number || "Unknown"}
        </div>
        <div className="text-xs text-slate-400">
          Duration {formatDuration(call.duration_seconds)} · Call ID {call.id.slice(0, 8)}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
          {customerRecord?.id && (
            <Link href={`/customers/${customerRecord.id}`} className="underline-offset-2 hover:underline">
              Customer: {customerRecord.name || customerRecord.phone || "View customer"}
            </Link>
          )}
          {call.job_id && (
            <Link href={`/jobs/${call.job_id}`} className="underline-offset-2 hover:underline">
              Job: {jobRecord?.title || call.job_id}
            </Link>
          )}
        </div>
      </div>

      {call.recording_url && (
        <div className="hb-card space-y-2">
          <p className="hb-label">Recording</p>
          <audio controls src={call.recording_url} className="w-full" />
          <a
            href={call.recording_url}
            className="underline-offset-2 hover:underline text-xs text-blue-300"
            target="_blank"
            rel="noreferrer"
          >
            Open recording in new tab
          </a>
        </div>
      )}

      <div className="hb-card space-y-2">
        <div className="flex items-center justify-between">
          <p className="hb-label">AI Summary</p>
          <span className="text-[11px] text-slate-400">AI-generated — sanity check important details.</span>
        </div>
        <p className="text-sm text-slate-200">{call.ai_summary || "Not processed yet."}</p>
      </div>

      <div className="hb-card space-y-2">
        <div className="flex items-center justify-between">
          <p className="hb-label">Transcript</p>
          <span className="text-[11px] text-slate-400">
            Captured automatically; verify names, addresses, and times.
          </span>
        </div>
        <p className="text-sm text-slate-200 whitespace-pre-wrap">
          {call.transcript || "Transcript not available yet."}
        </p>
      </div>
    </div>
  );
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m${secs ? ` ${secs}s` : ""}`;
}
