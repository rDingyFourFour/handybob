// app/jobs/page.tsx
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { HintBox } from "@/components/ui/HintBox";
import { createSignedMediaUrl } from "@/utils/supabase/storage";

type JobRow = {
  id: string;
  title: string | null;
  status: string | null;
  urgency: string | null;
  source?: string | null;
  ai_category?: string | null;
  ai_urgency?: string | null;
  created_at: string;
  customer: {
    name: string | null;
  }[] | null;
};

type MediaPreview = {
  job_id: string;
  signed_url: string | null;
};

function getParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
) {
  const value = searchParams?.[key];
  if (Array.isArray(value)) return value[0];
  return value ?? null;
}

function formatSource(source?: string | null) {
  const value = (source || "").toLowerCase();
  if (value === "web_form") return "Web form";
  if (value === "voicemail") return "Phone/voicemail";
  if (value === "manual") return "Manual";
  if (!value) return "Unknown";
  return value.replace(/_/g, " ");
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const resolvedSearchParams = await searchParams;
  const statusFilter = getParam(resolvedSearchParams, "status") ?? "all";
  const aiCategoryFilter = getParam(resolvedSearchParams, "ai_category") ?? "all";
  const aiUrgencyFilter = getParam(resolvedSearchParams, "ai_urgency") ?? "all";
  const sourceFilter = getParam(resolvedSearchParams, "source") ?? "all";

  let jobsQuery = supabase
    .from("jobs")
    .select("id, title, status, urgency, source, ai_category, ai_urgency, created_at, customer:customers(name)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (statusFilter !== "all") {
    jobsQuery = jobsQuery.eq("status", statusFilter);
  }
  if (aiCategoryFilter === "uncategorized") {
    jobsQuery = jobsQuery.is("ai_category", null);
  } else if (aiCategoryFilter !== "all") {
    jobsQuery = jobsQuery.eq("ai_category", aiCategoryFilter);
  }
  if (aiUrgencyFilter === "uncategorized") {
    jobsQuery = jobsQuery.is("ai_urgency", null);
  } else if (aiUrgencyFilter !== "all") {
    jobsQuery = jobsQuery.eq("ai_urgency", aiUrgencyFilter);
  }
  if (sourceFilter !== "all") {
    jobsQuery = jobsQuery.eq("source", sourceFilter);
  }

  const { data: jobs, error } = await jobsQuery.returns<JobRow[]>();
  if (error) {
    return (
      <div className="hb-card">
        <p className="text-sm text-red-400">
          Failed to load jobs: {error.message}
        </p>
      </div>
    );
  }

  const safeJobs: JobRow[] = jobs ?? [];

  const jobIds = safeJobs.map((job) => job.id);
  let mediaPreviews: Record<string, MediaPreview> = {};

  if (jobIds.length) {
    const { data: mediaRows } = await supabase
      .from("media")
      .select("id, job_id, storage_path, bucket_id, url, mime_type")
      .in("job_id", jobIds)
      .order("created_at", { ascending: false });

    const firstByJob = new Map<string, MediaPreview>();

    if (mediaRows) {
      for (const row of mediaRows) {
        if (firstByJob.has(row.job_id)) continue;
        if (row.mime_type && !row.mime_type.startsWith("image/")) continue;
        const path = row.storage_path || "";
        let signed_url: string | null = row.url ?? null;
        if (path) {
          const { signedUrl } = await createSignedMediaUrl(path, 60 * 30);
          signed_url = signedUrl ?? signed_url;
        }
        firstByJob.set(row.job_id, { job_id: row.job_id, signed_url });
      }
    }

    mediaPreviews = Object.fromEntries(firstByJob.entries());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1>Jobs</h1>
          <p className="hb-muted">Your active leads and jobs.</p>
        </div>
        <Link href="/jobs/new" className="hb-button">
          New job
        </Link>
      </div>

      <form className="hb-card flex flex-wrap items-center gap-3 text-sm" method="get">
        <div className="flex flex-col">
          <label className="hb-label text-xs" htmlFor="status-filter">Status</label>
          <select id="status-filter" name="status" defaultValue={statusFilter} className="hb-input">
            <option value="all">All</option>
            <option value="lead">Lead</option>
            <option value="quoted">Quoted</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="hb-label text-xs" htmlFor="ai-category-filter">AI category</label>
          <select id="ai-category-filter" name="ai_category" defaultValue={aiCategoryFilter} className="hb-input">
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
          <label className="hb-label text-xs" htmlFor="ai-urgency-filter">AI urgency</label>
          <select id="ai-urgency-filter" name="ai_urgency" defaultValue={aiUrgencyFilter} className="hb-input">
            <option value="all">All</option>
            <option value="emergency">Emergency</option>
            <option value="this_week">This week</option>
            <option value="flexible">Flexible</option>
            <option value="uncategorized">Uncategorized</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="hb-label text-xs" htmlFor="source-filter">Source</label>
          <select id="source-filter" name="source" defaultValue={sourceFilter} className="hb-input">
            <option value="all">All</option>
            <option value="web_form">Web form</option>
            <option value="voicemail">Phone call / voicemail</option>
            <option value="manual">Manual</option>
            <option value="other">Other</option>
          </select>
        </div>
        <button className="hb-button text-sm" type="submit">
          Apply filters
        </button>
        <Link href="/jobs" className="hb-button-ghost text-xs">
          Reset
        </Link>
      </form>

      <div className="hb-card">
        {!safeJobs.length ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
            <p className="text-lg font-semibold text-slate-100">
              No jobs yet. Create your first job to track work, quotes, and appointments.
            </p>
            <p className="hb-muted text-sm max-w-xl">
              Jobs are the central way HandyBob keeps quotes, customers, and visits organized. Start by logging a job so everything else has context.
            </p>
            <Link href="/jobs/new" className="hb-button">
              New job
            </Link>
            <HintBox id="jobs-no-jobs" title="Pro tip">
              Start with a job when someone calls or messages you. You can generate a quote from the job page whenever you need to send pricing.
            </HintBox>
          </div>
        ) : (
          <div className="space-y-2">
            {safeJobs.map((job) => (
              <div
                key={job.id}
                className="border-b border-slate-800 last:border-0 pb-2 last:pb-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline"
                  >
                    {job.title || "Untitled job"}
                  </Link>
                  </div>
                  {job.ai_urgency === "emergency" && (
                    <span className="rounded-full bg-red-500/10 px-2 py-1 text-[11px] uppercase tracking-wide text-red-300 border border-red-500/30">
                      Urgent
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-300 mt-1">
                  Source: <span className="rounded border border-slate-700 bg-slate-900/60 px-2 py-[3px] uppercase tracking-wide">{formatSource(job.source)}</span>
                </div>
                <div className="text-xs text-slate-400">
                  {job.customer?.[0]?.name || "Unknown customer"}
                </div>
                <div className="text-xs text-slate-500">
                  Status: {job.status} · Urgency: {job.urgency}
                </div>
                <div className="text-[11px] text-amber-300">
                  AI category: {job.ai_category || "Uncategorized"} · AI urgency: {job.ai_urgency || "Uncategorized"}
                </div>
                {mediaPreviews[job.id]?.signed_url && (
                  <div className="mt-2 flex items-center gap-2">
                    <Image
                      src={mediaPreviews[job.id]?.signed_url ?? ""}
                      alt="Latest job media"
                      width={64}
                      height={48}
                      className="h-12 w-16 rounded-md border border-slate-800 object-cover"
                      unoptimized
                    />
                    <span className="text-[11px] text-slate-400">Latest photo</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
