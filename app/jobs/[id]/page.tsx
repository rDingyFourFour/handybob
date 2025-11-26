import { notFound } from "next/navigation";
import Link from "next/link";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { getJobById } from "@/lib/domain/jobs";

// Job detail uses targeted domain helpers so it only fetches this one job and avoids broad queries.
export default async function JobDetailPage({
  params,
}: {
  params: { jobId: string };
}) {
  const supabase = await createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  const job = await getJobById({
    supabase,
    workspaceId: workspace.id,
    jobId: params.jobId,
  });

  if (!job) {
    notFound();
  }

  const createdAt = job.created_at ? new Date(job.created_at).toLocaleString() : "Unknown";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{job.title || "Untitled job"}</h1>
          <p className="text-sm text-slate-400">Status: {job.status ?? "Unknown"}</p>
        </div>
        <Link href="/jobs" className="hb-button text-sm">
          Back to jobs
        </Link>
      </div>

      <div className="hb-card space-y-3 text-sm text-slate-200">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Created</p>
          <p>{createdAt}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Customer</p>
          <p>{job.customer?.[0]?.name ?? "Unknown customer"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Source</p>
          <p>{job.source ?? "Unknown"}</p>
        </div>
      </div>

      <div className="hb-card text-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Notes</p>
        <p className="text-slate-200">Detailed notes and timeline data load via dedicated helpers when needed.</p>
      </div>
    </div>
  );
}
