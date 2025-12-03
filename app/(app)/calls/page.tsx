export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import { formatDateTime } from "@/utils/timeline/formatters";

const CHANNEL_HINTS = {
  phone: { icon: "📞", label: "Phone" },
  sms: { icon: "💬", label: "SMS" },
  email: { icon: "✉️", label: "Email" },
} as const;

type CallRow = {
  id: string;
  workspace_id: string;
  created_at: string | null;
  from_number: string | null;
  status: string | null;
  priority: string | null;
  needs_followup: boolean | null;
  job_id: string | null;
  customer_id: string | null;
  quote_id: string | null;
  body: string | null;
  channel: string | null;
  via: string | null;
  updated_at: string | null;
};

type FilteredJobSummary = {
  id: string;
  title: string | null;
  status: string | null;
};

import HbButton from "@/components/ui/hb-button";

export default async function CallsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await searchParamsPromise;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[calls] Failed to resolve workspace:", error);
    return (
      <div className="hb-shell pt-20 pb-8 space-y-4">
        <HbCard className="space-y-2">
          <h1 className="hb-heading-1 text-2xl font-semibold">Calls</h1>
          <p className="hb-muted text-sm">Unable to load workspace context.</p>
        </HbCard>
      </div>
    );
  }

  const rawJobId = searchParams?.jobId;
  const rawSummary = searchParams?.summary;
  const jobIdFilter = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId ?? null;
  const summaryFilter = rawSummary === "needs" ? "needs" : null;
  let filteredJob: FilteredJobSummary | null = null;

  if (jobIdFilter) {
    const { data: jobRow, error: jobError } = await supabase
      .from<FilteredJobSummary>("jobs")
      .select("id, title, status")
      .eq("workspace_id", workspace.id)
      .eq("id", jobIdFilter)
      .maybeSingle();

    if (jobError) {
      console.error("[calls] Failed to load filtered job:", jobError);
    }

    filteredJob = jobRow ?? null;
  }

  let query = supabase.from("calls").select("*").eq("workspace_id", workspace.id);

  if (jobIdFilter) {
    query = query.eq("job_id", jobIdFilter);
  }

  query = query.order("created_at", { ascending: false }).limit(50);

  const callsRes = await query;
  if (callsRes.error) {
    console.error("[calls/index] Supabase error loading calls", {
      workspaceId: workspace.id,
      error: callsRes.error,
    });
  } else {
    console.log("[calls/index] Loaded calls", {
      count: callsRes.data?.length ?? 0,
      workspaceId: workspace.id,
    });
  }

  const calls = (callsRes.data ?? []) as CallRow[];
  const callsToShow =
    summaryFilter === "needs"
      ? calls.filter((call) => !call.body?.trim())
      : calls;

  const filterJobLabel = filteredJob
    ? filteredJob.title ?? `Job ${filteredJob.id.slice(0, 8)}…`
    : jobIdFilter
    ? `Job ${jobIdFilter.slice(0, 8)}…`
    : null;
  const filteredJobId = filteredJob?.id ?? jobIdFilter;

  const summaryNeedsHref = jobIdFilter
    ? `/calls?jobId=${encodeURIComponent(jobIdFilter)}&summary=needs`
    : "/calls?summary=needs";
  const viewAllHref = jobIdFilter
    ? `/calls?jobId=${encodeURIComponent(jobIdFilter)}`
    : "/calls";

  const headerSubtitle =
    !jobIdFilter && !summaryFilter
      ? "All recent calls across your workspace."
      : "Simple log of recent calls.";

  return (
    <div className="hb-shell pt-20 pb-8 space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Calls</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Calls</h1>
          <p className="hb-muted text-sm">{headerSubtitle}</p>
          {summaryFilter === "needs" && (
            <p className="mt-1 text-sm font-semibold text-emerald-200">
              Showing calls that still need a summary.
            </p>
          )}
          {jobIdFilter && filterJobLabel && (
            <div className="mt-2 space-y-2 text-slate-400">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Filtered by job</p>
              <p className="text-xl font-semibold text-white">{filterJobLabel}</p>
              <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em]">
                {filteredJob ? (
                  <>
                    <Link
                      href={`/jobs/${filteredJob.id}`}
                      className="rounded-full border border-slate-800/60 px-3 py-1 font-semibold text-slate-100 hover:border-slate-600"
                    >
                      Open job
                    </Link>
                    <Link
                      href={`/jobs/${filteredJob.id}#phone-call-script-section`}
                      className="rounded-full border border-slate-800/60 px-3 py-1 font-semibold text-slate-100 hover:border-slate-600"
                    >
                      Open job phone agent
                    </Link>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">
                    Job ID {jobIdFilter.slice(0, 8)}… not found
                  </span>
                )}
                {filteredJobId && (
                  <Link
                    href={`/calls/new?jobId=${encodeURIComponent(filteredJobId)}`}
                    className="rounded-full border border-slate-800/60 px-3 py-1 font-semibold text-slate-100 hover:border-slate-600"
                  >
                    New call for this job
                  </Link>
                )}
              </div>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em]">
            {summaryFilter === "needs" ? (
              <>
                <span className="rounded-full border border-emerald-200 bg-emerald-100/20 px-3 py-1 font-semibold text-emerald-200">
                  Showing calls needing summary
                </span>
                <Link
                  href={viewAllHref}
                  className="rounded-full border border-slate-800/60 px-3 py-1 font-semibold text-slate-100 hover:border-slate-600"
                >
                  View all calls
                </Link>
              </>
            ) : (
              <Link
                href={summaryNeedsHref}
                className="rounded-full border border-slate-800/60 px-3 py-1 font-semibold text-slate-100 hover:border-slate-600"
              >
                Show calls needing summary
              </Link>
            )}
          </div>
        </div>
        <HbButton
          as={Link}
          href={
            jobIdFilter
              ? `/calls/new?jobId=${encodeURIComponent(jobIdFilter)}`
              : "/calls/new"
          }
          size="sm"
          variant="secondary"
        >
          New call
        </HbButton>
      </header>

      {jobIdFilter && (
        <p className="px-4 text-sm text-slate-400">
          Showing calls associated with this job.
        </p>
      )}
      <HbCard className="space-y-3">
        {callsToShow.length === 0 ? (
          !jobIdFilter && !summaryFilter ? (
            <div className="space-y-4">
              <h2 className="hb-card-heading text-lg font-semibold">No calls yet</h2>
              <p className="hb-muted text-sm">
                Start by opening a job and creating a call workspace for it.
              </p>
              <HbButton as={Link} href="/jobs" size="sm" variant="secondary">
                Open jobs
              </HbButton>
            </div>
          ) : summaryFilter === "needs" ? (
            <div className="space-y-2">
              <h2 className="hb-card-heading text-lg font-semibold">
                No calls need a summary right now.
              </h2>
              <p className="hb-muted text-sm">
                {filterJobLabel
                  ? `Once you finish guided calls without a summary for ${filterJobLabel}, they’ll appear here.`
                  : "Once you finish guided calls without a summary, they’ll appear here."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <h2 className="hb-card-heading text-lg font-semibold">No calls for this job yet.</h2>
              <p className="hb-muted text-sm">
                {filterJobLabel
                  ? `${filterJobLabel} has no calls yet. Use 'New call for this job' to start the first phone agent session.`
                  : "No calls logged for this job yet. Use 'New call for this job' to start the first phone agent session."}
              </p>
            </div>
          )
        ) : (
          <div className="space-y-3">
            {callsToShow.map((call) => {
              const summaryMissing = !call.body?.trim();
              const normalizedChannel = (call.channel ?? "phone").toLowerCase();
              const knownChannel = normalizedChannel in CHANNEL_HINTS;
              const channelKey = (knownChannel ? normalizedChannel : "phone") as keyof typeof CHANNEL_HINTS;
              const channelHint = CHANNEL_HINTS[channelKey];
              const rawChannelLabel =
                !knownChannel && call.channel ? call.channel : null;
              const lastUpdated = formatDateTime(call.updated_at ?? call.created_at, "—");

              return (
                <div
                  key={call.id}
                  className={`flex flex-col gap-3 rounded-lg border px-4 py-3 transition ${
                    summaryMissing
                      ? "border-amber-200/70 bg-amber-100/10 hover:bg-amber-100/20 border-l-4 border-l-amber-400"
                      : "border-slate-800 bg-slate-950/60 hover:bg-slate-900/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {call.job_id ? (
                          <Link
                            href={`/jobs/${call.job_id}`}
                            className="text-base font-semibold text-white hover:text-slate-200"
                          >
                            Job #{call.job_id.slice(0, 8)}…
                          </Link>
                        ) : (
                          <span className="text-base font-semibold text-slate-200">
                            Call {call.id.slice(0, 8)}…
                          </span>
                        )}
                        {call.quote_id && (
                          <Link
                            href={`/quotes/${call.quote_id}`}
                            className="text-sm font-medium text-slate-400 hover:text-slate-200"
                          >
                            Quote #{call.quote_id.slice(0, 8)}…
                          </Link>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1 text-slate-200">
                          <span aria-hidden>{channelHint.icon}</span>
                          <span className="font-semibold text-slate-100">
                            {channelHint.label}
                            {rawChannelLabel ? ` (${rawChannelLabel})` : ""}
                          </span>
                        </span>
                        {call.via && <span className="text-slate-400">via {call.via}</span>}
                        <span className="text-slate-400">Status: {call.status ?? "unknown"}</span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.3em] ${
                            summaryMissing
                              ? "border-amber-300 bg-amber-100/40 text-amber-400"
                              : "border-slate-600 bg-slate-900 text-slate-300"
                          }`}
                        >
                          {summaryMissing ? "Summary needed" : "Summary recorded"}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400">
                        From: {call.from_number ?? "Unknown"}
                      </p>
                      {call.customer_id && (
                        <p className="text-xs text-slate-500">
                          Customer: {call.customer_id.slice(0, 8)}…
                        </p>
                      )}
                      <p className="text-xs text-slate-500">
                        Priority: {call.priority ?? "normal"} · Needs follow-up:{" "}
                        {call.needs_followup ? "Yes" : "No"}
                      </p>
                      <p className="text-xs text-slate-500">Last updated {lastUpdated}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 text-right">
                      <Link
                        href={`/calls/${call.id}`}
                        className="inline-flex items-center rounded-full border border-slate-800/60 px-2 py-0.5 font-semibold text-slate-100 hover:border-slate-600"
                      >
                        View call
                      </Link>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                        {formatDateTime(call.created_at, "—")}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </HbCard>
    </div>
  );
}
