// app/jobs/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { createSignedMediaUrl } from "@/utils/supabase/storage";

type JobRow = {
  id: string;
  title: string | null;
  status: string | null;
  urgency: string | null;
  created_at: string;
  customer: {
    name: string | null;
  }[] | null;
};

type MediaPreview = {
  job_id: string;
  signed_url: string | null;
};

export default async function JobsPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select(
      "id, title, status, urgency, created_at, customer:customers(name)"
    )
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<JobRow[]>();
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

      <div className="hb-card">
        {!safeJobs.length ? (
          <p className="hb-muted">No jobs yet. Create your first one.</p>
        ) : (
          <div className="space-y-2">
            {safeJobs.map((job) => (
              <div
                key={job.id}
                className="border-b border-slate-800 last:border-0 pb-2 last:pb-0"
              >
                <div className="text-sm font-medium">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline"
                  >
                    {job.title || "Untitled job"}
                  </Link>
                </div>
                <div className="text-xs text-slate-400">
                  {job.customer?.[0]?.name || "Unknown customer"}
                </div>
                <div className="text-xs text-slate-500">
                  Status: {job.status} · Urgency: {job.urgency}
                </div>
                {mediaPreviews[job.id]?.signed_url && (
                  <div className="mt-2 flex items-center gap-2">
                    <img
                      src={mediaPreviews[job.id].signed_url!}
                      alt="Latest job media"
                      className="h-12 w-16 rounded-md border border-slate-800 object-cover"
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
