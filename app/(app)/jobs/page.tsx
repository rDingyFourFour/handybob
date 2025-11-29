export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type JobRow = {
  id: string;
  title: string | null;
  status: string | null;
  created_at: string | null;
  source: string | null;
  urgency: string | null;
  ai_urgency: string | null;
};

export default async function JobsPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[jobs] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[jobs] Failed to resolve user:", error);
    redirect("/");
  }

  if (!user) {
    redirect("/");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[jobs] Failed to resolve workspace:", error);
    redirect("/");
  }

  if (!workspace) {
    redirect("/");
  }

  let jobs: JobRow[] = [];
  let jobsError: unknown = null;
  try {
    const { data, error } = await supabase
      .from("jobs")
      .select("id, title, status, created_at, source, urgency, ai_urgency")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false, nulls: "last" })
      .limit(50);
    if (error) {
      console.error("[jobs] Failed to load jobs:", error);
      jobsError = error;
    } else {
      jobs = (data ?? []) as JobRow[];
    }
  } catch (error) {
    console.error("[jobs] Failed to load jobs:", error);
    jobsError = error;
  }

  const workspaceName = workspace.name ?? "Workspace";
  function formatDate(value: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString();
  }

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Jobs</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Jobs in {workspaceName}</h1>
          <p className="hb-muted text-sm">
            Track leads and active work so you always know what needs attention next.
          </p>
        </div>
        <HbButton as={Link} href="/jobs/new" size="sm">
          New job
        </HbButton>
      </header>

      {jobsError ? (
        <HbCard className="space-y-2">
          <h2 className="hb-card-heading text-lg font-semibold">Unable to load jobs</h2>
          <p className="hb-muted text-sm">
            Something went wrong while fetching jobs. Please try again in a moment.
          </p>
        </HbCard>
      ) : jobs.length === 0 ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">No jobs yet</h2>
          <p className="hb-muted text-sm">
            Create a job or capture a lead and it will appear here so you can manage it.
          </p>
          <HbButton as={Link} href="/jobs/new">
            Create your first job
          </HbButton>
        </HbCard>
      ) : (
        <HbCard className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="hb-card-heading text-lg font-semibold">All jobs</h2>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Showing {jobs.length} job{jobs.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="space-y-2">
            {jobs.map((job) => {
              const jobDate = formatDate(job.created_at);
              const detailParts = [job.status, job.source].filter(Boolean);
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="group block rounded-2xl px-4 py-3 transition hover:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-slate-100">
                        {job.title ?? "Untitled job"}
                      </p>
                      {detailParts.length > 0 && (
                        <p className="text-sm text-slate-400">
                          {detailParts.join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      {jobDate && (
                        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                          Created {jobDate}
                        </p>
                      )}
                      {job.urgency && (
                        <span className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                          {job.urgency}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </HbCard>
      )}
    </div>
  );
}
