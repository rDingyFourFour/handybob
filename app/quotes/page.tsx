import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";

type QuoteListItem = {
  id: string;
  status: string | null;
  total: number | null;
  created_at: string | null;
  jobs:
    | { title: string | null }
    | { title: string | null }[]
    | null;
};

function extractJobTitle(job: QuoteListItem["jobs"]) {
  if (Array.isArray(job)) {
    return job[0]?.title ?? null;
  }
  return job?.title ?? null;
}

export default async function QuotesPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: quotes, error } = await supabase
    .from("quotes")
    .select(
      `
        id,
        status,
        total,
        created_at,
        jobs (
          title
        )
      `,
    )
    .order("created_at", { ascending: false });

  const safeQuotes = (quotes ?? []) as QuoteListItem[];
  const loadError = error?.message;

  return (
    <div className="space-y-6">
      <div className="hb-card space-y-1">
        <h1>Quotes</h1>
        <p className="hb-muted">Review, send, and manage recent quotes.</p>
      </div>

      <div className="hb-card space-y-4">
        {loadError ? (
          <p className="text-sm text-red-400">
            Failed to load quotes: {loadError}
          </p>
        ) : safeQuotes.length ? (
          safeQuotes.map((quote) => (
            <div
              key={quote.id}
              className="flex flex-col gap-4 rounded-xl border border-slate-800 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-semibold">
                  Quote #{quote.id.slice(0, 8)} · {quote.status}
                </p>
                <p className="hb-muted text-sm">
                  Job: {extractJobTitle(quote.jobs) || "Untitled job"}
                </p>
                <p className="text-xs text-slate-400">
                  Created{" "}
                  {quote.created_at
                    ? new Date(quote.created_at).toLocaleString()
                    : "—"}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-lg font-semibold">
                  $
                  {Number(quote.total ?? 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <Link href={`/quotes/${quote.id}`} className="hb-button">
                  View quote
                </Link>
              </div>
            </div>
          ))
        ) : (
          <p className="hb-muted text-sm">
            No quotes yet. Generate one from a job to see it here.
          </p>
        )}
      </div>
    </div>
  );
}
