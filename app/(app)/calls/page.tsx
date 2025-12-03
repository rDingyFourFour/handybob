export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";

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

  const formatDate = (value: string | null) => {
    if (!value) return "—";
    return new Date(value).toLocaleString();
  };

  return (
    <div className="hb-shell pt-20 pb-8 space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Calls</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Calls</h1>
          <p className="hb-muted text-sm">Simple log of recent calls.</p>
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

      {filteredJob && callsToShow.length > 0 && (
        <p className="px-4 text-[11px] uppercase tracking-[0.3em] text-slate-400">
          Showing calls linked to this job.
        </p>
      )}
      <HbCard className="space-y-3">
        {callsToShow.length === 0 ? (
          <div className="space-y-2">
            <h2 className="hb-card-heading text-lg font-semibold">No calls yet</h2>
            <p className="hb-muted text-sm">
              {summaryFilter === "needs"
                ? filteredJob
                  ? "No calls for this job currently need a summary. Switch back to all calls to see everything."
                  : "No calls currently need a summary. Switch back to all calls to see completed sessions."
                : filteredJob
                ? "No calls found for this job yet. End a guided call with a summary to create one."
                : jobIdFilter
                ? "No calls logged for this job yet. End a guided call with a summary to create one."
                : "You can create one using the button above."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {callsToShow.map((call) => {
              const summaryMissing = !call.body?.trim();
              return (
                <div
                  key={call.id}
                  className="block flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3 transition hover:bg-slate-900/80"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{formatDate(call.created_at)}</p>
                    <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-400">
                      {call.customer_id && (
                        <span className="flex items-center gap-1 text-slate-400">
                          <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                            Customer:
                          </span>
                          <span className="text-slate-300">{call.customer_id.slice(0, 8)}…</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    {call.job_id && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Job:</span>
                        <Link
                          href={`/jobs/${call.job_id}`}
                          className="font-semibold text-slate-100 hover:text-slate-200"
                        >
                          #{call.job_id.slice(0, 8)}…
                        </Link>
                      </div>
                    )}
                    {call.quote_id && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Quote:</span>
                        <Link
                          href={`/quotes/${call.quote_id}`}
                          className="font-semibold text-slate-100 hover:text-slate-200"
                        >
                          #{call.quote_id.slice(0, 8)}…
                        </Link>
                      </div>
                    )}
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.3em] ${
                        summaryMissing
                          ? "border-amber-200 bg-amber-100/20 text-amber-200"
                          : "border-emerald-200 bg-emerald-100/20 text-emerald-200"
                      }`}
                    >
                      {summaryMissing ? "Summary needed" : "Summary recorded"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400">
                    From: {call.from_number ?? "Unknown"} · Status: {call.status ?? "unknown"}
                  </p>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                    Priority: {call.priority ?? "normal"} · Needs follow-up:{" "}
                    {call.needs_followup ? "Yes" : "No"}
                  </p>
                  <div className="text-right text-xs uppercase tracking-[0.3em] text-slate-400">
                    <Link
                      href={`/calls/${call.id}`}
                      className="inline-flex items-center rounded-full border border-slate-800/60 px-2 py-0.5 font-semibold text-slate-100 hover:border-slate-600"
                    >
                      View call
                    </Link>
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
