 "use client";

import { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { HintBox } from "@/components/ui/HintBox";
import { JobRow, getJobAttentionLevel } from "@/lib/domain/jobs";

type JobCustomer = {
  name: string | null;
};

type PageInfo = {
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

type Filters = {
  page: number;
  status: string | null;
  search: string | null;
};

type JobsPageClientProps = {
  jobs: JobRow[];
  summary: {
    open: number;
    scheduled: number;
    completedLast30Days: number;
  };
  pageInfo: PageInfo;
  filters: Filters;
};

const attentionStyles: Record<
  "overdue" | "upcoming" | "normal",
  string
> = {
  overdue: "rounded-full border border-red-500/60 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-red-300",
  upcoming: "rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200",
  normal: "rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-200",
};

const buildHrefForPage = (filters: Filters, targetPage: number) => {
  const params = new URLSearchParams();
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.search) {
    params.set("q", filters.search);
  }
  if (targetPage > 1) {
    params.set("page", String(targetPage));
  }
  const query = params.toString();
  return `/jobs${query ? `?${query}` : ""}`;
};

const JobsPageClient = ({
  jobs,
  summary,
  pageInfo,
  filters,
}: JobsPageClientProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilters = (overrides: {
    status?: string | null;
    search?: string | null;
    page?: number;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (overrides.status !== undefined) {
      if (overrides.status) {
        params.set("status", overrides.status);
      } else {
        params.delete("status");
      }
    }
    if (overrides.search !== undefined) {
      if (overrides.search) {
        params.set("q", overrides.search);
      } else {
        params.delete("q");
      }
    }
    if (overrides.page !== undefined) {
      if (overrides.page > 1) {
        params.set("page", String(overrides.page));
      } else {
        params.delete("page");
      }
    }

    const query = params.toString();
    router.push(`/jobs${query ? `?${query}` : ""}`);
  };

  const handleStatusChange = (event: FormEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value;
    updateFilters({ status: value || null, page: 1 });
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const q = (data.get("q") as string | null)?.trim() || null;
    updateFilters({ search: q, page: 1 });
  };

  const prevPage = Math.max(1, pageInfo.page - 1);
  const nextPage = pageInfo.page + 1;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Jobs</h1>
            <p className="text-sm text-slate-400">
              Showing one bounded page of jobs so the build stays responsive.
            </p>
          </div>
          <Link href="/jobs/new" className="hb-button">
            New job
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="hb-card px-3 py-2">
            <p className="text-2xl font-semibold">{summary.open}</p>
            <p className="text-xs text-slate-400">Open jobs</p>
          </div>
          <div className="hb-card px-3 py-2">
            <p className="text-2xl font-semibold">{summary.scheduled}</p>
            <p className="text-xs text-slate-400">Scheduled</p>
          </div>
          <div className="hb-card px-3 py-2">
            <p className="text-2xl font-semibold">{summary.completedLast30Days}</p>
            <p className="text-xs text-slate-400">Completed (30d)</p>
          </div>
        </div>
      </header>

      <section className="hb-card space-y-3">
        <form className="flex flex-wrap items-end gap-3 text-sm" onSubmit={handleSearch}>
          <label className="flex flex-col gap-1">
            Status
            <select
              name="status"
              defaultValue={filters.status ?? ""}
              className="hb-input"
              onChange={handleStatusChange}
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Search
            <input
              name="q"
              defaultValue={filters.search ?? ""}
              placeholder="Job title or customer"
              className="hb-input"
              type="text"
            />
          </label>
          <button className="hb-button text-sm" type="submit">
            Apply filters
          </button>
        </form>
        <HintBox id="jobs-safe" title="Build-safe pagination">
          This page only requests one capped page of jobs per render, preventing Next.js builds
          from scanning the entire table.
        </HintBox>
      </section>

      <section className="space-y-3">
        {jobs.length === 0 ? (
          <div className="hb-card text-center text-sm text-slate-400">
            No jobs match these filters; broaden the status or search term to get results.
          </div>
        ) : (
          jobs.map((job) => {
            const attention = getJobAttentionLevel(job);
            return (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="hb-card flex flex-col gap-1 border border-slate-800 px-4 py-3 text-sm transition hover:border-slate-500"
              >
                <div className="flex items-center justify-between text-slate-200">
                  <span className="font-semibold text-slate-100">
                    {job.title || "Untitled job"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      {job.status ?? "Unknown"}
                    </span>
                    <span className={attentionStyles[attention]}>
                      {attention.toUpperCase()}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Created {job.created_at ? new Date(job.created_at).toLocaleDateString() : "unknown"}
                </p>
                <p className="text-xs text-slate-400">
                  Customer: {job.customer?.[0]?.name ?? "Unknown customer"}
                </p>
              </Link>
            );
          })
        )}
      </section>

      <footer className="flex items-center justify-between text-sm">
        <Link
          href={buildHrefForPage(filters, prevPage)}
          className={`hb-button ${filters.page === 1 ? "pointer-events-none opacity-60" : ""}`}
          aria-disabled={filters.page === 1}
        >
          Previous
        </Link>
        <span>
          Page {pageInfo.page} · Showing {pageInfo.pageSize} records per page
        </span>
        <Link
          href={buildHrefForPage(filters, nextPage)}
          className={`hb-button ${!pageInfo.hasNextPage ? "pointer-events-none opacity-60" : ""}`}
          aria-disabled={!pageInfo.hasNextPage}
        >
          Next
        </Link>
      </footer>
    </div>
  );
};

export default JobsPageClient;
