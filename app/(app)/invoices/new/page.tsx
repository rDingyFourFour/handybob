export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import { createInvoice } from "@/app/actions/invoices";

type JobSummary = {
  id: string;
  title: string | null;
  customer_id: string | null;
  customers:
    | { id: string | null; name: string | null }
    | Array<{ id: string | null; name: string | null }>
    | null;
};

type QuoteSummary = {
  id: string;
  total: number | null;
  status: string | null;
};

function resolveCustomerName(job?: JobSummary): string | null {
  if (!job) return null;
  if (!job.customers) return null;
  if (Array.isArray(job.customers)) {
    return job.customers[0]?.name ?? null;
  }
  return job.customers.name;
}

function shortId(value: string | null | undefined) {
  if (!value) return "—";
  return value.slice(0, 8);
}

export default async function NewInvoicePage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await searchParamsPromise;
  const rawJobId = searchParams?.jobId;
  const rawQuoteId = searchParams?.quoteId;
  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
  const quoteId = Array.isArray(rawQuoteId) ? rawQuoteId[0] : rawQuoteId;

  if (!jobId) {
    redirect("/jobs");
  }

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[invoices/new] Failed to initialize Supabase client:", error);
    redirect("/invoices");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[invoices/new] Failed to resolve workspace:", error);
    redirect("/invoices");
  }

  if (!workspace) {
    redirect("/invoices");
  }

  let job: JobSummary | null = null;
  let jobError = false;

  try {
    const { data, error } = await supabase
      .from<JobSummary>("jobs")
      .select("id, title, customer_id, customers(id, name)")
      .eq("workspace_id", workspace.id)
      .eq("id", jobId)
      .maybeSingle();

    if (error) {
      console.error("[invoices/new] Failed to load job:", error);
      jobError = true;
    } else {
      job = data ?? null;
    }
  } catch (error) {
    console.error("[invoices/new] Job lookup failed:", error);
    jobError = true;
  }

  let quote: QuoteSummary | null = null;
  let quoteError = false;
  if (quoteId) {
    try {
      const { data, error } = await supabase
        .from<QuoteSummary>("quotes")
        .select("id, total, status")
        .eq("workspace_id", workspace.id)
        .eq("id", quoteId)
        .maybeSingle();
      if (error) {
        console.error("[invoices/new] Quote lookup failed:", error);
        quoteError = true;
      } else {
        quote = data ?? null;
      }
    } catch (error) {
      console.error("[invoices/new] Quote lookup failed:", error);
      quoteError = true;
    }
  }

  const customerName = resolveCustomerName(job);
  const amountDefault = quote?.total?.toString() ?? "";
  const jobTitle = job?.title ?? `Job ${shortId(job?.id)}`;

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Invoices</p>
        <h1 className="hb-heading-1 text-3xl font-semibold">New invoice</h1>
        <p className="hb-muted text-sm">Create an invoice from a job or quote so you can collect payment.</p>
        {job && (
          <div className="grid gap-2 text-sm text-slate-400 md:grid-cols-3">
            <p>
              Job:{" "}
              <Link href={`/jobs/${job.id}`} className="font-semibold text-slate-100 hover:text-slate-50">
                {jobTitle}
              </Link>
            </p>
            <p>
              Customer:{" "}
              <span className="font-semibold text-slate-100">{customerName ?? "Customer TBD"}</span>
            </p>
            {quote && (
              <p>
                Quote total: <span className="font-semibold text-slate-100">${quote.total?.toFixed(2)}</span>
              </p>
            )}
          </div>
        )}
        {jobError && <p className="text-sm text-rose-300">Unable to preload the job details right now.</p>}
        {quoteError && <p className="text-sm text-rose-300">Unable to preload the quote details right now.</p>}
      </header>

      <HbCard className="space-y-5">
        <form action={createInvoice} className="space-y-5">
          <input type="hidden" name="jobId" value={jobId} />
          {quote && quote.id && <input type="hidden" name="quoteId" value={quote.id} />}

          <div className="space-y-2">
            <label htmlFor="total" className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
              Amount
              <span className="text-slate-400">Required</span>
            </label>
            <input
              id="total"
              name="total"
              type="number"
              min="0"
              step="0.01"
              defaultValue={amountDefault}
              placeholder="0.00"
              required
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="status" className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue="draft"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            >
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="notes" className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Use this space to describe the invoice or remind the customer what's included."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <HbButton type="submit" size="sm">
              Create invoice
            </HbButton>
            <HbButton as={Link} href={`/jobs/${jobId}`} size="sm" variant="ghost">
              Back to job
            </HbButton>
          </div>
        </form>
      </HbCard>
    </div>
  );
}
