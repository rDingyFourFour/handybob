export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { formatCurrency } from "@/utils/timeline/formatters";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type QuoteRow = {
  id: string;
  status: string | null;
  total: number | null;
  created_at: string | null;
  job_id: string | null;
  client_message_template?: string | null;
};

export default async function QuotesPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[quotes] Failed to initialize Supabase client:", error);
    redirect("/");
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[quotes] Failed to resolve user:", error);
    redirect("/");
  }

  if (!user) {
    redirect("/");
  }

  let workspace;
  try {
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[quotes] Failed to resolve workspace:", error);
    redirect("/");
  }

  if (!workspace) {
    redirect("/");
  }

  const workspaceName = workspace.name ?? "Workspace";

  let quotes: QuoteRow[] = [];
  let quotesError: unknown = null;
  try {
    const { data, error } = await supabase
      .from("quotes")
      .select("id, status, total, created_at, job_id, client_message_template")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false, nulls: "last" })
      .limit(50);
    if (error) {
      console.error("[quotes] Failed to load quotes:", error);
      quotesError = error;
    } else {
      quotes = (data ?? []) as QuoteRow[];
    }
  } catch (error) {
    console.error("[quotes] Failed to load quotes:", error);
    quotesError = error;
  }

  function formatDate(value: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  const shortId = (value: string) => value.slice(0, 8);

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Quotes</p>
          <h1 className="hb-heading-1 text-3xl font-semibold">Quotes</h1>
          <p className="hb-muted text-sm">
            See which proposals are out, which are accepted, and what’s ready to invoice.
          </p>
          <p className="hb-muted text-sm">Showing quotes for {workspaceName}.</p>
        </div>
        <div className="flex items-center gap-2">
          <HbButton as={Link} href="/quotes/new" size="sm" variant="secondary">
            New quote
          </HbButton>
          <HbButton as={Link} href="/jobs/new" size="sm" variant="secondary">
            Start from a job
          </HbButton>
        </div>
      </header>
      {quotesError ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">Something went wrong</h2>
          <p className="hb-muted text-sm">We couldn’t load this page. Try again or go back.</p>
        </HbCard>
      ) : quotes.length === 0 ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">No quotes yet</h2>
          <p className="hb-muted text-sm">You can create one using the button above.</p>
          <HbButton as={Link} href="/jobs/new" size="sm">
            Go to jobs
          </HbButton>
        </HbCard>
      ) : (
        <HbCard className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="hb-card-heading text-lg font-semibold">All quotes</h2>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Showing {quotes.length} quote{quotes.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="space-y-2">
            {quotes.map((quote) => {
              const totalLabel = quote.total != null ? formatCurrency(quote.total) : "—";
              const createdLabel = formatDate(quote.created_at) ?? "—";
              const jobIdShort = quote.job_id ? quote.job_id.slice(0, 8) : null;
              return (
                <article
                  key={quote.id}
                  className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-3 transition hover:border-slate-600"
                >
                  <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-[minmax(0,1fr)_130px_120px_140px_140px]">
                    <div>
                      <p className="text-base font-semibold text-slate-100">Quote {shortId(quote.id)}</p>
                      {quote.client_message_template && (
                        <p className="text-xs text-slate-500 truncate">
                          {quote.client_message_template.slice(0, 80)}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-slate-100">{quote.status ?? "draft"}</p>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Status:</p>
                    </div>
                    <div>
                      <p className="text-slate-100">{totalLabel}</p>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Total:</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-slate-100">
                        Job: {jobIdShort ? jobIdShort : "No job linked"}
                      </p>
                      {quote.job_id ? (
                        <Link
                          href={`/jobs/${quote.job_id}`}
                          className="text-xs uppercase tracking-[0.3em] text-sky-300 hover:text-sky-200"
                        >
                          View job
                        </Link>
                      ) : (
                        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Job: N/A</p>
                      )}
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-slate-100">{createdLabel}</p>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Created:</p>
                      <Link
                        href={`/quotes/${quote.id}`}
                        className="text-xs uppercase tracking-[0.3em] text-sky-300 hover:text-sky-200"
                      >
                        View quote
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </HbCard>
      )}
    </div>
  );
}
