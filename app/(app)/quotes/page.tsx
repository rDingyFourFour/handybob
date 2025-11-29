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
          <h1 className="hb-heading-1 text-3xl font-semibold">Quotes in {workspaceName}</h1>
          <p className="hb-muted text-sm">
            See which proposals are out, which are accepted, and what’s ready to invoice.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HbButton as={Link} href="/quotes/new" size="sm">
            New quote
          </HbButton>
          <HbButton as={Link} href="/jobs/new" size="sm" variant="secondary">
            Start from a job
          </HbButton>
        </div>
      </header>
      {quotesError ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">Unable to load quotes</h2>
          <p className="hb-muted text-sm">
            Something went wrong while loading your quotes. Please try again in a moment.
          </p>
        </HbCard>
      ) : quotes.length === 0 ? (
        <HbCard className="space-y-3">
          <h2 className="hb-card-heading text-lg font-semibold">No quotes yet</h2>
          <p className="hb-muted text-sm">
            Once you create a quote for a job, you’ll see it here with its status and total.
          </p>
          <p className="hb-muted text-sm">
            Start by creating a job and then generating a quote from that job.
          </p>
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
              const totalLabel =
                quote.total != null ? formatCurrency(quote.total) : "Total not set";
              const createdLabel = formatDate(quote.created_at);
              return (
                <Link
                  key={quote.id}
                  href={`/quotes/${quote.id}`}
                  className="group block rounded-2xl px-4 py-3 transition hover:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-slate-100">
                        Quote {shortId(quote.id)}
                      </p>
                      <p className="text-sm text-slate-400">
                        Status: {quote.status ?? "draft"}
                      </p>
                      <p className="text-sm text-slate-400">{totalLabel}</p>
                      {quote.client_message_template && (
                        <p className="text-xs text-slate-500">
                          {quote.client_message_template.slice(0, 80)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      {createdLabel && (
                        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                          Created {createdLabel}
                        </p>
                      )}
                      <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                        View
                      </span>
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
