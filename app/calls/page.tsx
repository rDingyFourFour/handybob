import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { processCallRecording } from "./processCallAction";

type CallRow = {
  id: string;
  direction: string | null;
  status: string | null;
  started_at: string | null;
  created_at?: string | null;
  duration_seconds: number | null;
  summary: string | null;
  ai_summary?: string | null;
  transcript?: string | null;
  recording_url?: string | null;
  from_number?: string | null;
  to_number?: string | null;
  job_id?: string | null;
  jobs?: { id: string; title: string | null } | null;
  customers?: { id: string; name: string | null; phone: string | null } | null;
  priority?: string | null;
  needs_followup?: boolean | null;
  attention_score?: number | null;
  attention_reason?: string | null;
  ai_category?: string | null;
  ai_urgency?: string | null;
};

function formatDateTime(date: string | null) {
  if (!date) return "Unknown time";
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m${secs ? ` ${secs}s` : ""}`;
}

function snippet(text: string | null | undefined, max = 160) {
  if (!text) return null;
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function getParam(
  params: Record<string, string | string[] | undefined> | undefined,
  key: string,
) {
  const value = params?.[key];
  if (Array.isArray(value)) return value[0];
  return value ?? null;
}

export default async function CallsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const needsProcessing = searchParams?.filter === "needs_processing";
  const newLeads = searchParams?.filter === "new_leads";
  const processedFilter = getParam(searchParams, "processed") ?? (needsProcessing ? "unprocessed" : "all");
  const aiCategoryFilter = getParam(searchParams, "ai_category") ?? "all";
  const aiUrgencyFilter = getParam(searchParams, "ai_urgency") ?? "all";

  let query = supabase
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
        jobs ( id, title ),
        customers ( id, name, phone ),
        priority,
        needs_followup,
        attention_score,
        attention_reason,
        ai_category,
        ai_urgency
      `
    )
    .eq("user_id", user.id);

  if (needsProcessing) {
    query = query.is("transcript", null);
  }
  if (newLeads) {
    query = query.is("job_id", null);
  }
  if (processedFilter === "unprocessed") {
    query = query.or("transcript.is.null,ai_summary.is.null,job_id.is.null,needs_followup.eq.true");
  } else if (processedFilter === "processed") {
    query = query.not("transcript", "is", null).not("ai_summary", "is", null);
  }
  if (aiCategoryFilter === "uncategorized") {
    query = query.is("ai_category", null);
  } else if (aiCategoryFilter !== "all") {
    query = query.eq("ai_category", aiCategoryFilter);
  }
  if (aiUrgencyFilter === "uncategorized") {
    query = query.is("ai_urgency", null);
  } else if (aiUrgencyFilter !== "all") {
    query = query.eq("ai_urgency", aiUrgencyFilter);
  }

  const { data: calls, error } = await query.order("created_at", { ascending: false }).limit(50).returns<CallRow[]>();

  const safeCalls: CallRow[] = calls ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Calls</h1>
          <p className="hb-muted">
            Voicemails are transcribed and summarized so you never lose a lead. Process new recordings to attach them to customers and jobs.
          </p>
        </div>
        <span className="text-slate-600 hidden md:inline text-xs">Twilio webhook: /api/webhooks/voice</span>
      </div>

      <form className="hb-card flex flex-wrap items-center gap-3 text-sm" method="get">
        <div className="flex flex-col">
          <label className="hb-label text-xs" htmlFor="processed-filter">Processed</label>
          <select id="processed-filter" name="processed" defaultValue={processedFilter} className="hb-input">
            <option value="all">All</option>
            <option value="unprocessed">Unprocessed</option>
            <option value="processed">Processed</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="hb-label text-xs" htmlFor="call-category-filter">AI category</label>
          <select id="call-category-filter" name="ai_category" defaultValue={aiCategoryFilter} className="hb-input">
            <option value="all">All</option>
            <option value="plumbing">Plumbing</option>
            <option value="electrical">Electrical</option>
            <option value="carpentry">Carpentry</option>
            <option value="hvac">HVAC</option>
            <option value="roofing">Roofing</option>
            <option value="painting">Painting</option>
            <option value="landscaping">Landscaping</option>
            <option value="general">General</option>
            <option value="other">Other</option>
            <option value="uncategorized">Uncategorized</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="hb-label text-xs" htmlFor="call-urgency-filter">AI urgency</label>
          <select id="call-urgency-filter" name="ai_urgency" defaultValue={aiUrgencyFilter} className="hb-input">
            <option value="all">All</option>
            <option value="emergency">Emergency</option>
            <option value="urgent">Urgent</option>
            <option value="this_week">This week</option>
            <option value="flexible">Flexible</option>
            <option value="uncategorized">Uncategorized</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button className="hb-button text-sm" type="submit">
            Apply filters
          </button>
          <Link href="/calls" className="hb-button-ghost text-xs">
            Reset
          </Link>
        </div>
      </form>

      <div className="hb-card space-y-3">
        {error ? (
          <p className="text-sm text-red-400">Failed to load calls: {error.message}</p>
        ) : !safeCalls.length ? (
          <p className="hb-muted text-sm">No calls yet. Point your Twilio Voice webhook to this app to capture voicemails.</p>
        ) : (
          safeCalls.map((call) => {
            const primarySummary =
              call.ai_summary ||
              call.summary ||
              snippet(call.transcript, 200) ||
              "Voicemail logged.";
            const transcriptSnippet = snippet(call.transcript, 220);

            return (
              <div
                key={call.id}
                className="border-b border-slate-800 last:border-0 pb-3 last:pb-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold flex gap-2 items-center">
                    <Link
                      href={`/calls/${call.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {call.direction === "inbound" ? "Inbound" : "Outbound"} call
                    </Link>
                    <span className="text-xs text-slate-400">
                      {call.from_number || "Unknown"} {call.customers?.name ? `· ${call.customers.name}` : ""}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(call.created_at || call.started_at)}
                  </span>
                </div>
                <div className="text-xs text-slate-400 flex flex-wrap gap-2">
                  <span>From {call.from_number || "Unknown"} → {call.to_number || "Unknown"}</span>
                  <span>Duration {formatDuration(call.duration_seconds)}</span>
                </div>
                {primarySummary && (
                  <p className="hb-muted text-sm mt-1">{primarySummary}</p>
                )}
                {transcriptSnippet && (
                  <p className="text-xs text-slate-400 mt-1">
                    Transcript: {transcriptSnippet}
                  </p>
                )}
                <p className="text-[11px] text-amber-300 mt-1">
                  AI category: {call.ai_category || "Uncategorized"} · AI urgency: {call.ai_urgency || "Uncategorized"}
                </p>
                {(call.attention_reason || call.priority) && (
                  <p className="text-[11px] text-amber-300 mt-1">
                    {call.priority ? `Priority: ${call.priority}` : "Priority: normal"}
                    {call.attention_reason ? ` · ${call.attention_reason}` : ""}
                  </p>
                )}
                {!call.transcript && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <form action={processCallRecording}>
                      <input type="hidden" name="call_id" value={call.id} />
                      <button
                        className="hb-button-ghost text-xs"
                        type="submit"
                        disabled={!call.recording_url}
                      >
                        Transcribe & summarize
                      </button>
                    </form>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  <span className="rounded-full border border-slate-800 px-2 py-1 text-[11px] uppercase tracking-wide">
                    {call.priority ? `${call.priority} priority` : "normal priority"}
                  </span>
                  {call.needs_followup ? (
                    <span className="rounded-full border border-amber-500/40 px-2 py-1 text-[11px] uppercase tracking-wide text-amber-300">
                      Needs follow-up
                    </span>
                  ) : null}
                  <span className="rounded-full border border-slate-800 px-2 py-1 text-[11px] uppercase tracking-wide">
                    {call.status || "unknown"}
                  </span>
                  {call.customers?.id ? (
                    <Link
                      href={`/customers/${call.customers.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {call.customers.name || call.customers.phone || "View customer"}
                    </Link>
                  ) : null}
                  {call.job_id && (
                    <Link
                      href={`/jobs/${call.job_id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {call.jobs?.title || "Open job"}
                    </Link>
                  )}
                  {call.recording_url && (
                    <a
                      href={call.recording_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-2 hover:underline"
                    >
                      Listen to recording
                    </a>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
