import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import {
  getJobAttentionLevel,
  getJobsPageForWorkspace,
  getJobsSummaryForWorkspace,
  type JobAttentionLevel,
  type JobRow,
} from "@/lib/domain/jobs";
import JobsPageClient from "@/components/jobs/JobsPageClient";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function JobsPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams | undefined>;
}) {
  const resolvedSearchParams = await searchParams;
  const pageParam = resolvedSearchParams?.page;
  const page = Math.max(
    1,
    Number(Array.isArray(pageParam) ? pageParam[0] : pageParam) || 1,
  );
  const statusFilter = Array.isArray(resolvedSearchParams?.status)
    ? resolvedSearchParams.status[0]
    : resolvedSearchParams?.status;
  const searchValue = Array.isArray(resolvedSearchParams?.q)
    ? resolvedSearchParams.q[0]
    : resolvedSearchParams?.q;

  const supabase = await createServerClient();
  const { workspace } = await getCurrentWorkspace({ supabase });

  const { jobs, pageInfo } = await getJobsPageForWorkspace({
    supabase,
    workspaceId: workspace.id,
    page,
    statusFilter: statusFilter ?? undefined,
    search: searchValue ?? undefined,
  });

  const summary = await getJobsSummaryForWorkspace({
    supabase,
    workspaceId: workspace.id,
  });

  type JobWithAttention = JobRow & { attention: JobAttentionLevel };
  const jobsWithAttention: JobWithAttention[] = jobs.map((job) => ({
    ...job,
    attention: getJobAttentionLevel(job),
  }));

  return (
    <div className="space-y-6">
      <JobsPageClient
        jobs={jobsWithAttention}
        summary={summary}
        pageInfo={pageInfo}
        filters={{
          page,
          status: statusFilter ?? null,
          search: searchValue ?? null,
        }}
      />
    </div>
  );
}
