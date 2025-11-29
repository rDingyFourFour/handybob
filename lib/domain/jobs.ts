import type { SupabaseClient } from "@supabase/supabase-js";

// Jobs table columns: id, user_id, customer_id, title, status, description_raw, source, urgency, ai_urgency, priority, attention_reason, attention_score, workspace_id, created_at, updated_at
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export type JobRow = {
  id: string;
  title: string | null;
  status: string | null;
  source: string | null;
  created_at: string | null;
  scheduled_at: string | null;
  customer?: { name: string | null }[] | null;
};

type JobsPageParams = {
  supabase: SupabaseClient;
  workspaceId: string;
  page?: number;
  pageSize?: number;
  statusFilter?: string;
  search?: string;
};

type PageInfo = {
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

type JobsPageResult = {
  jobs: JobRow[];
  pageInfo: PageInfo;
};

type JobQuery = ReturnType<SupabaseClient["from"]>;

const sanitizePageSize = (value?: number) => {
  if (!value || value < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(value, MAX_PAGE_SIZE);
};

const buildSearchPattern = (search?: string) => {
  if (!search) return null;
  const cleaned = search.trim();
  if (!cleaned.length) return null;
  return `%${cleaned.replace(/[%_]/g, "\\$&")}%`;
};

const domainFilters = ({ statusFilter, search }: JobsPageParams) => {
  const filters: Array<{
    apply: (query: JobQuery) => void;
  }> = [];

  if (statusFilter) {
    filters.push({
      apply(query) {
        query.eq("status", statusFilter);
      },
    });
  }

  const pattern = buildSearchPattern(search);
  if (pattern) {
    filters.push({
      apply(query) {
        query.or(`title.ilike.${pattern},customer->>name.ilike.${pattern}`);
      },
    });
  }

  return filters;
};

// All helpers below keep queries workspace-scoped, paginated, and bounded so builds stay fast.
export async function getJobsPageForWorkspace(params: JobsPageParams): Promise<JobsPageResult> {
  const { supabase, workspaceId } = params;
  const page = Math.max(1, params.page ?? 1);
  const pageSize = sanitizePageSize(params.pageSize);
  const rangeStart = (page - 1) * pageSize;
  const rangeEnd = rangeStart + pageSize - 1;

  const baseQuery = supabase
    .from("jobs")
    .select(
      "id, title, status, source, created_at, scheduled_at, customer:customers(name)",
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  domainFilters(params).forEach((filter) => filter.apply(baseQuery));

  const { data: jobs, count } = await baseQuery.range(rangeStart, rangeEnd);
  const total = count ?? 0;
  const hasNextPage = total > page * pageSize;
  const hasPrevPage = page > 1;

  return {
    jobs: jobs ?? [],
    pageInfo: {
      page,
      pageSize,
      hasNextPage,
      hasPrevPage,
    },
  };
}

export async function getJobById(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  jobId: string;
}): Promise<JobRow | null> {
  const { supabase, workspaceId, jobId } = params;
  const { data } = await supabase
  .from("jobs")
  .select("id, title, status, source, created_at, scheduled_at, customer:customers(name)")
    .match({ id: jobId, workspace_id: workspaceId })
    .maybeSingle();
  return data ?? null;
}

export async function getJobsSummaryForWorkspace(params: {
  supabase: SupabaseClient;
  workspaceId: string;
}): Promise<{
  open: number;
  scheduled: number;
  completedLast30Days: number;
}> {
  const { supabase, workspaceId } = params;
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const since = thirtyDaysAgo.toISOString();

  const [open, scheduled, completed] = await Promise.all([
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "open"), // count open jobs per workspace using database-side aggregation
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "scheduled"), // count scheduled jobs without reading rows client-side
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "completed")
      .gte("created_at", since), // completed last 30 days using bounded date filter
  ]);

  return {
    open: open.count ?? 0,
    scheduled: scheduled.count ?? 0,
    completedLast30Days: completed.count ?? 0,
  };
}

// Intentionally lightweight attention signal derived from already-fetched job fields.
export type JobAttentionLevel = "overdue" | "upcoming" | "normal";

export function getJobAttentionLevel(job: JobRow): JobAttentionLevel {
  const now = new Date();

  if (job.status === "completed") {
    return "normal";
  }

  if (job.status === "scheduled" && job.scheduled_at) {
    const scheduled = new Date(job.scheduled_at);
    return scheduled < now ? "overdue" : "upcoming";
  }

  if (job.status === "open" && job.created_at) {
    const created = new Date(job.created_at);
    const daysOpen = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOpen > 30) {
      return "overdue";
    }
  }

  return "normal";
}

// Job domain entry: re-export AI utilities so domain/ consumers can import `classifyJobWithAi` and `buildJobTimelinePayload`.
export { classifyJobWithAi } from "@/utils/ai/classifyJob";
export { buildJobTimelinePayload } from "@/utils/ai/jobTimelinePayload";
