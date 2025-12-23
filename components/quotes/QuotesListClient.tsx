"use client";

import Link from "next/link";
import { useState } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";

export type QuoteRowType = {
  id: string;
  status: string | null;
  totalLabel: string;
  createdLabel: string;
  jobId: string | null;
  clientMessageTemplate: string | null;
  smartQuoteUsed: boolean;
};

type QuotesListClientProps = {
  initialQuotes: QuoteRowType[];
};

const smartQuoteBadgeClasses =
  "inline-flex items-center gap-2 rounded-full border px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.3em] bg-amber-500/10 border-amber-400/40 text-amber-300";
const smartQuoteBadgeDotClasses = "h-1.5 w-1.5 rounded-full bg-amber-300";

const shortId = (value: string) => value.slice(0, 8);

export default function QuotesListClient({ initialQuotes }: QuotesListClientProps) {
  const [quotes] = useState<QuoteRowType[]>(() => initialQuotes);
  const hasQuotes = quotes.length > 0;

  return (
    <HbCard className={hasQuotes ? "space-y-4" : "space-y-3"}>
      {hasQuotes ? (
        <div className="flex items-center justify-between">
          <h2 className="hb-card-heading text-lg font-semibold">All quotes</h2>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Showing {quotes.length} quote{quotes.length === 1 ? "" : "s"}
          </p>
        </div>
      ) : (
        <>
          <h2 className="hb-card-heading text-lg font-semibold">No quotes yet</h2>
          <p className="hb-muted text-sm">You can create one using the button above.</p>
        </>
      )}
      <div className="space-y-2" data-testid="quotes-list">
        {hasQuotes ? (
          quotes.map((quote) => {
            const jobIdShort = quote.jobId ? quote.jobId.slice(0, 8) : null;
            return (
              <article
                key={quote.id}
                className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-3 transition hover:border-slate-600"
              >
                <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-[minmax(0,1fr)_130px_120px_140px_140px]">
                  <div>
                    <p className="text-base font-semibold text-slate-100">
                      Quote {shortId(quote.id)}
                    </p>
                    {quote.clientMessageTemplate && (
                      <p className="text-xs text-slate-500 truncate">
                        {quote.clientMessageTemplate.slice(0, 80)}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-slate-100 flex flex-wrap items-center gap-2">
                      {quote.status ?? "draft"}
                      {quote.smartQuoteUsed ? (
                        <span className={smartQuoteBadgeClasses}>
                          <span className={smartQuoteBadgeDotClasses} />
                          Smart Quote
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Status:</p>
                  </div>
                  <div>
                    <p className="text-slate-100">{quote.totalLabel}</p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Total:</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-slate-100">
                      Job: {jobIdShort ? jobIdShort : "No job linked"}
                    </p>
                    {quote.jobId ? (
                      <Link
                        href={`/jobs/${quote.jobId}`}
                        className="text-xs uppercase tracking-[0.3em] text-sky-300 hover:text-sky-200"
                      >
                        View job
                      </Link>
                    ) : (
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Job: N/A</p>
                    )}
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-slate-100">{quote.createdLabel}</p>
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
          })
        ) : (
          <HbButton as={Link} href="/jobs/new" size="sm">
            Go to jobs
          </HbButton>
        )}
      </div>
    </HbCard>
  );
}
