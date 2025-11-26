import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import {
  getJobsPageForWorkspace,
  getJobsSummaryForWorkspace,
} from "@/lib/domain/jobs";
import JobsPageClient from "@/components/jobs/JobsPageClient";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function JobsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const pageParam = searchParams?.page;
  const page = Math.max(
    1,
    Number(Array.isArray(pageParam) ? pageParam[0] : pageParam) || 1,
  );
  const statusFilter = Array.isArray(searchParams?.status)
    ? searchParams.status[0]
    : searchParams?.status;
  const searchValue = Array.isArray(searchParams?.q)
    ? searchParams.q[0]
    : searchParams?.q;

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

  return (
    <div className="space-y-6">
      <JobsPageClient
        jobs={jobs}
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
