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
          <h1 className="hb-heading-1 text-3xl font-semibold">Jobs</h1>
          <p className="hb-muted text-sm">Track leads and active work so you always know what needs attention next.</p>
        </div>
        <HbButton as={Link} href="/jobs/new" size="sm" variant="secondary">
          New job
        </HbButton>
      </header>

      {jobsError ? (
        <HbCard className="space-y-2">
          <h2 className="hb-card-heading text-lg font-semibold">Something went wrong</h2>
          <p className="hb-muted text-sm">We couldn’t load this page. Try again or go back.</p>
        </HbCard>
      ) : jobs.length === 0 ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">No jobs yet</h2>
          <p className="hb-muted text-sm">You can create one using the button above.</p>
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
              const jobDate = formatDate(job.created_at) ?? "—";
              const customerDisplay = job.customer_id ? job.customer_id.slice(0, 8) : "—";
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="group block rounded-2xl px-4 py-3 transition hover:bg-slate-900"
                >
                  <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-[minmax(0,1fr)_minmax(0,150px)_110px_140px]">
                    <div>
                      <p className="text-base font-semibold text-slate-100">
                        {job.title ?? "Untitled job"}
                      </p>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                        {workspaceName}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-100">{job.status ?? "unknown"}</p>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                        Source: {job.source ?? "manual"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-100">{customerDisplay}</p>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                        Customer:
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-100">{jobDate}</p>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                        Created:
                      </p>
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
