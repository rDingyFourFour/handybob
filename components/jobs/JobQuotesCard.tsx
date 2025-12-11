"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { formatCurrency, formatFriendlyDateTime } from "@/utils/timeline/formatters";

const smartQuoteBadgeClasses =
  "inline-flex items-center gap-2 rounded-full border px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.3em] bg-amber-500/10 border-amber-400/40 text-amber-300";
const smartQuoteBadgeDotClasses = "h-1.5 w-1.5 rounded-full bg-amber-300";

export type JobQuoteSummary = {
  id: string;
  job_id: string | null;
  status: string | null;
  total: number | null;
  created_at: string | null;
  smart_quote_used: boolean | null;
};

type Props = {
  quotes: JobQuoteSummary[];
  quotesError: boolean;
  quoteHref: string;
};

export default function JobQuotesCard({ quotes, quotesError, quoteHref }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const sortedQuotes = useMemo(() => {
    return [...quotes].sort((a, b) => {
      const aTime = a.created_at ? Date.parse(a.created_at) : 0;
      const bTime = b.created_at ? Date.parse(b.created_at) : 0;
      return bTime - aTime;
    });
  }, [quotes]);
  const latestQuote = sortedQuotes[0] ?? null;
  const topThreeQuotes = sortedQuotes.slice(0, 3);
  const hasMoreQuotes = sortedQuotes.length > 3;
  const createdLabel = latestQuote?.created_at
    ? formatFriendlyDateTime(latestQuote.created_at, "")
    : null;
  const headerSummary = quotesError
    ? "Unable to load quotes right now."
    : quotes.length === 0
      ? "No quotes yet for this job."
      : `${quotes.length} quotes • Latest ${latestQuote?.status ?? "quote"}${createdLabel ? ` • Created ${createdLabel}` : ""}`;
  const toggleLabel = collapsed ? "Show quotes" : "Hide quotes";
  const emptyStateContent = (
    <div className="space-y-2 text-sm text-slate-400">
      <p>No quotes yet for this job.</p>
      <HbButton as={Link} href={quoteHref} size="sm" variant="secondary">
        New quote for this job
      </HbButton>
    </div>
  );
  const errorStateContent = (
    <div className="space-y-2 text-sm text-slate-400">
      <p>Something went wrong. We couldn’t load quotes for this job.</p>
      <HbButton as={Link} href={quoteHref} size="sm" variant="secondary">
        New quote for this job
      </HbButton>
    </div>
  );
  const renderQuotePreviewRow = (quote: JobQuoteSummary) => {
    const createdLabelPreview = quote.created_at
      ? formatFriendlyDateTime(quote.created_at, "—")
      : "Date unknown";
    return (
      <div
        key={`preview-${quote.id}`}
        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800/60 bg-slate-950/40 px-4 py-3 text-sm text-slate-200"
      >
        <div className="space-y-1">
          <p className="font-semibold text-slate-100">Quote {quote.id.slice(0, 8)}</p>
          <p className="text-xs text-slate-400">
            {createdLabelPreview} • Status: {quote.status ?? "—"}
          </p>
        </div>
        <span className="text-sm font-semibold text-slate-100">
          {quote.total != null ? formatCurrency(quote.total) : "—"}
        </span>
      </div>
    );
  };

  const renderCollapsedContent = () => {
    if (quotesError) {
      return errorStateContent;
    }
    if (!sortedQuotes.length) {
      return emptyStateContent;
    }
    return (
      <div className="space-y-2">
        {topThreeQuotes.map((quote) => renderQuotePreviewRow(quote))}
        {hasMoreQuotes && (
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Showing 3 of {sortedQuotes.length} quotes. Click “Show quotes” to see all.
          </p>
        )}
      </div>
    );
  };

  const renderExpandedList = () => {
    if (quotesError) {
      return errorStateContent;
    }
    if (!sortedQuotes.length) {
      return emptyStateContent;
    }
    return (
      <div className="space-y-2">
        {sortedQuotes.map((quote) => {
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
                  Created {formatFriendlyDateTime(quote.created_at, "—")}
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
    );
  };

  return (
    <HbCard className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Job quotes</p>
          <h2 className="hb-heading-3 text-xl font-semibold">Quotes for this job</h2>
          <p className="text-sm text-slate-400">{headerSummary}</p>
        </div>
        <button
          type="button"
          className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400 transition hover:text-slate-200"
          onClick={() => setCollapsed((value) => !value)}
        >
          {toggleLabel}
        </button>
      </div>
      {collapsed ? renderCollapsedContent() : (
        <div className="space-y-2">{renderExpandedList()}</div>
      )}
    </HbCard>
  );
}
