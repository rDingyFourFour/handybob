export const dynamic = "force-dynamic";

import type { ReactNode } from "react";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import { formatCurrency } from "@/utils/timeline/formatters";

type JobRecord = {
  id: string;
  title: string | null;
  status: string | null;
  urgency: string | null;
  source: string | null;
  ai_urgency: string | null;
  priority: string | null;
  attention_score: number | null;
  attention_reason: string | null;
  description_raw: string | null;
  created_at: string | null;
  customer_id: string | null;
  customers:
    | { id: string | null; name: string | null }
    | Array<{ id: string | null; name: string | null }>
    | null;
};

type JobQuoteSummary = {
  id: string;
  job_id: string | null;
  status: string | null;
  total: number | null;
  created_at: string | null;
  smart_quote_used: boolean | null;
};

const smartQuoteBadgeClasses =
  "inline-flex items-center gap-2 rounded-full border px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.3em] bg-amber-500/10 border-amber-400/40 text-amber-300";
const smartQuoteBadgeDotClasses = "h-1.5 w-1.5 rounded-full bg-amber-300";

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fallbackCard(title: string, body: string, action?: ReactNode) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{body}</p>
        {action}
      </HbCard>
    </div>
  );
}

export default async function JobDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  if (!id || !id.trim()) {
    notFound();
  }

  if (id === "new") {
    redirect("/jobs/new");
    return null;
  }

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[job-detail] Failed to init Supabase client", error);
    return fallbackCard("Job unavailable", "Could not connect to Supabase. Please try again.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
    return null;
  }

  let workspace;
  try {
    const workspaceResult = await getCurrentWorkspace({ supabase });
    workspace = workspaceResult.workspace;
  } catch (error) {
    console.error("[job-detail] Failed to resolve workspace", error);
    return fallbackCard("Job unavailable", "Unable to resolve workspace. Please try again.");
  }

  if (!workspace) {
    return fallbackCard("Job unavailable", "Unable to resolve workspace. Please try again.");
  }

  let job: JobRecord | null = null;

  try {
    const { data, error } = await supabase
      .from<JobRecord>("jobs")
      .select(
        `
          id,
          title,
          status,
          urgency,
          source,
          ai_urgency,
          priority,
          attention_score,
          attention_reason,
          description_raw,
          created_at,
          customer_id,
          customers(id, name)
        `
      )
      .eq("workspace_id", workspace.id)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[job-detail] Job lookup failed", error);
      return fallbackCard("Job not found", "We couldn’t find that job. It may have been deleted.");
    }

    job = data ?? null;
  } catch (error) {
    console.error("[job-detail] Job query error", error);
    return fallbackCard("Job not found", "We couldn’t find that job. It may have been deleted.");
  }

  if (!job) {
    return fallbackCard("Job not found", "We couldn’t find that job. It may have been deleted.");
  }

  let quotes: JobQuoteSummary[] = [];
  let quotesError = false;
  try {
    const { data, error } = await supabase
      .from<JobQuoteSummary>("quotes")
      .select("id, job_id, status, total, created_at, smart_quote_used")
      .eq("workspace_id", workspace.id)
      .eq("job_id", job.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[job-detail] Failed to load quotes for job:", error);
      quotesError = true;
    } else {
      quotes = data ?? [];
    }
  } catch (error) {
    console.error("[job-detail] Quotes query failed:", error);
    quotesError = true;
  }

  if (!quotesError) {
    const aiCount = quotes.reduce(
      (count, quote) => (quote.smart_quote_used ? count + 1 : count),
      0,
    );
    const manualCount = quotes.length - aiCount;
    console.log("[smart-quote-metrics] job quotes badges", {
      jobId: job.id,
      count: quotes.length,
      aiCount,
      manualCount,
    });
  }

  const customer =
    Array.isArray(job.customers) && job.customers.length > 0
      ? job.customers[0]
      : job.customers ?? null;

  const customerName = customer?.name ?? null;
  const customerId = customer?.id ?? job.customer_id ?? null;

  const jobTitle = job.title ?? "Untitled job";
  const createdLabel = formatDate(job.created_at);
  const quoteParams = new URLSearchParams();
  quoteParams.set("jobId", job.id);
  quoteParams.set("source", "job");
  const description = (job.description_raw ?? job.title ?? "").trim();
  if (description) {
    quoteParams.set("description", description);
  }
  const quoteHref = `/quotes/new?${quoteParams.toString()}`;

  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Job details</p>
            <h1 className="hb-heading-2 text-2xl font-semibold">{jobTitle}</h1>
            <p className="text-sm text-slate-400">Status: {job.status ?? "—"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <HbButton as={Link} href={quoteHref} size="sm" variant="secondary">
              Generate quote from job
            </HbButton>
            <HbButton as="a" href="/jobs" size="sm">
              Back to jobs
            </HbButton>
          </div>
        </header>
        <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-2">
          <p>Urgency: {job.urgency ?? "—"}</p>
          <p>Source: {job.source ?? "—"}</p>
          <p>AI urgency: {job.ai_urgency ?? "—"}</p>
          <p>Priority: {job.priority ?? "—"}</p>
          <p>Attention reason: {job.attention_reason ?? "—"}</p>
          <p>Attention score: {job.attention_score ?? "—"}</p>
          <p>Created: {createdLabel}</p>
          {customerName && customerId && (
            <p>
              Customer:{" "}
              <Link href={`/customers/${customerId}`} className="text-sky-300 hover:text-sky-200">
                {customerName}
              </Link>
            </p>
          )}
        </div>
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Description:</p>
          <p className="text-sm text-slate-300">{job.description_raw ?? "No description provided."}</p>
        </div>
      </HbCard>
      <HbCard className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Job quotes</p>
          <h2 className="hb-heading-3 text-xl font-semibold">Quotes for this job</h2>
        </div>
        {quotesError ? (
          <div className="space-y-2 text-sm text-slate-400">
            <p>Something went wrong. We couldn’t load quotes for this job.</p>
            <HbButton as={Link} href={quoteHref} size="sm" variant="secondary">
              New quote for this job
            </HbButton>
          </div>
        ) : quotes.length === 0 ? (
          <div className="space-y-2 text-sm text-slate-400">
            <p>No quotes yet for this job.</p>
            <HbButton as={Link} href={quoteHref} size="sm" variant="secondary">
              New quote for this job
            </HbButton>
          </div>
        ) : (
          <div className="space-y-2">
            {quotes.map((quote) => {
              const isAiQuote = !!quote.smart_quote_used;
              return (
                <Link
                  key={quote.id}
                  href={`/quotes/${quote.id}`}
                  className="block rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300 transition hover:border-slate-600 hover:bg-slate-900"
                >
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <span className="font-semibold">Quote {quote.id.slice(0, 8)}</span>
                    <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                      Created {formatDate(quote.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-2">
                      Status: {quote.status ?? "—"}
                      {isAiQuote && (
                        <span className={smartQuoteBadgeClasses}>
                          <span className={smartQuoteBadgeDotClasses} />
                          Smart Quote
                        </span>
                      )}
                    </span>
                    <span>Total: {quote.total != null ? formatCurrency(quote.total) : "—"}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </HbCard>
    </div>
  );
}
