import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import { formatCurrency } from "@/utils/timeline/formatters";

type QuoteRow = {
  id: string;
  status: string | null;
  total: number | null;
  created_at: string | null;
  job?: { title: string | null } | null;
};

const ERROR_MESSAGE = "Unable to load quotes right now. Please try again.";

export default async function QuotesPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[quotes] Failed to initialize Supabase client:", error);
    return (
      <div className="hb-shell pt-20 pb-8">
        <div className="hb-card">
          <h1 className="text-xl font-semibold">Unable to load quotes</h1>
          <p className="text-sm text-slate-400">{ERROR_MESSAGE}</p>
        </div>
      </div>
    );
  }

  let user;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (error) {
    console.error("[quotes] Failed to resolve the user:", error);
    return (
      <div className="hb-shell pt-20 pb-8">
        <div className="hb-card">
          <h1 className="text-xl font-semibold">Unable to load quotes</h1>
          <p className="text-sm text-slate-400">{ERROR_MESSAGE}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    redirect("/login");
  }

  let workspaceContext;
  try {
    workspaceContext = await getCurrentWorkspace({ supabase });
  } catch (error) {
    console.error("[quotes] Failed to resolve workspace:", error);
    return (
      <div className="hb-shell pt-20 pb-8">
        <div className="hb-card">
          <h1 className="text-xl font-semibold">Unable to load quotes</h1>
          <p className="text-sm text-slate-400">{ERROR_MESSAGE}</p>
        </div>
      </div>
    );
  }

  const { workspace } = workspaceContext;

  const { data: quotes, error } = await supabase
    .from("quotes")
    .select("id, status, total, created_at, job:jobs(title)")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false, nulls: "last" })
    .limit(50);

  if (error) {
    console.error("[quotes] failed to load quotes", error);
    return (
      <div className="hb-shell pt-20 pb-8">
        <div className="hb-card">
          <h1 className="text-xl font-semibold">Unable to load quotes</h1>
          <p className="text-sm text-slate-400">{ERROR_MESSAGE}</p>
        </div>
      </div>
    );
  }

  const quoteList = (quotes ?? []) as QuoteRow[];

  if (quoteList.length === 0) {
    return (
      <div className="hb-shell pt-20 pb-8 space-y-4">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Quotes</h1>
          <p className="text-sm text-slate-400">No quotes found yet.</p>
        </header>
        <Link href="/quotes/new" className="hb-button">
          Create a quote
        </Link>
      </div>
    );
  }

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Quotes</h1>
        <Link href="/quotes/new" className="hb-button">
          New quote
        </Link>
      </header>
      <div className="space-y-3">
        {quoteList.map((quote) => {
          const label = quote.job?.title ? `Quote for ${quote.job.title}` : `Quote #${quote.id.slice(0, 8)}`;
          const createdLabel = quote.created_at
            ? new Date(quote.created_at).toLocaleDateString()
            : "—";
          const totalLabel = quote.total != null ? formatCurrency(quote.total) : "—";
          return (
            <div key={quote.id} className="hb-card space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="hb-card-heading">{label}</p>
                  <p className="text-xs text-slate-400 capitalize">
                    Status: {quote.status ?? "Unknown"} · Created {createdLabel}
                  </p>
                </div>
                <Link
                  href={`/quotes/${quote.id}`}
                  className="text-sm font-medium text-sky-400 hover:text-sky-300"
                >
                  View
                </Link>
              </div>
              <p className="text-sm font-semibold text-slate-100">{totalLabel}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
