export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

type QuoteLineItem = {
  description?: string;
  amount?: number;
};

type QuoteRecord = {
  id: string;
  workspace_id: string;
  user_id: string;
  job_id: string | null;
  status: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  line_items: QuoteLineItem[] | null;
  client_message_template: string | null;
  public_token: string | null;
  created_at: string | null;
  updated_at: string | null;
  accepted_at: string | null;
  paid_at: string | null;
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

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function fallbackCard(title: string, body: string) {
  return (
    <div className="hb-shell pt-20 pb-8">
      <HbCard className="space-y-3">
        <h1 className="hb-heading-1 text-2xl font-semibold">{title}</h1>
        <p className="hb-muted text-sm">{body}</p>
        <HbButton as="a" href="/quotes" size="sm">
          Back to quotes
        </HbButton>
      </HbCard>
    </div>
  );
}

export default async function QuoteDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  if (!id || !id.trim()) {
    redirect("/quotes");
    return null;
  }

  if (id === "new") {
    redirect("/quotes/new");
    return null;
  }

  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[quote-detail] Failed to init Supabase client", error);
    return fallbackCard("Quote unavailable", "Could not connect to Supabase. Please try again.");
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
    workspace = (await getCurrentWorkspace({ supabase })).workspace;
  } catch (error) {
    console.error("[quote-detail] Failed to resolve workspace", error);
    return fallbackCard("Quote unavailable", "Unable to resolve workspace. Please try again.");
  }

  if (!workspace) {
    return fallbackCard("Quote unavailable", "Unable to resolve workspace. Please try again.");
  }

  let quote: QuoteRecord | null = null;

  try {
    const { data, error } = await supabase
      .from<QuoteRecord>("quotes")
      .select(
        `
          id,
          workspace_id,
          user_id,
          job_id,
          status,
          subtotal,
          tax,
          total,
          line_items,
          client_message_template,
          public_token,
          created_at,
          updated_at,
          accepted_at,
          paid_at,
          smart_quote_used
        `
      )
      .eq("workspace_id", workspace.id)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[quote-detail] Quote lookup failed:", error);
      return fallbackCard("Quote not found", "We couldn’t find that quote. It may have been deleted.");
    }

    quote = data ?? null;
  } catch (error) {
    console.error("[quote-detail] Quote query error:", error);
    return fallbackCard("Quote not found", "We couldn’t find that quote. It may have been deleted.");
  }

  if (!quote) {
    return fallbackCard("Quote not found", "We couldn’t find that quote. It may have been deleted.");
  }

  const title = quote.job_id ? `Quote for job ${quote.job_id.slice(0, 8)}` : "Quote details";
  const statusLabel = quote.status ?? "draft";
  const isAiQuote = !!quote.smart_quote_used;
  const logPayload = {
    quoteId: quote.id,
    smartQuoteUsed: isAiQuote,
    source: "quote_detail_badge",
  };
  console.log("[smart-quote-metrics] quote detail badge", logPayload);
  const lineItems = Array.isArray(quote.line_items) ? quote.line_items : [];
  const firstItems = lineItems.slice(0, 3);

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <HbCard className="space-y-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Quote details</p>
            <h1 className="hb-heading-2 text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-slate-400">
              Status: {statusLabel} · Total: {formatCurrency(quote.total)}
            </p>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Created: {formatDate(quote.created_at)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            {isAiQuote && (
              <span className={smartQuoteBadgeClasses}>
                <span className={smartQuoteBadgeDotClasses} />
                Smart Quote
              </span>
            )}
            <div className="flex flex-wrap gap-3">
              <HbButton as="a" href="/quotes" variant="secondary" size="sm">
                Back to quotes
              </HbButton>
              {quote.job_id && (
                <HbButton as="a" href={`/jobs/${quote.job_id}`} variant="secondary" size="sm">
                  Back to job
                </HbButton>
              )}
            </div>
          </div>
        </header>
        <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-2">
          <p>
            <span className="font-semibold">Subtotal:</span> {formatCurrency(quote.subtotal)}
          </p>
          <p>
            <span className="font-semibold">Tax:</span> {formatCurrency(quote.tax)}
          </p>
          <p>
            <span className="font-semibold">Accepted:</span> {formatDate(quote.accepted_at)}
          </p>
          <p>
            <span className="font-semibold">Paid:</span> {formatDate(quote.paid_at)}
          </p>
          <p>
            <span className="font-semibold">Updated:</span> {formatDate(quote.updated_at)}
          </p>
        </div>
        {quote.client_message_template && (
          <div className="space-y-2 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Client message</p>
            <p>{quote.client_message_template}</p>
          </div>
        )}
        {firstItems.length > 0 && (
          <div className="space-y-2 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Line items</p>
            <ul className="list-disc pl-4">
              {firstItems.map((item, index) => (
                <li key={index}>
                  {item.description ?? "Item"} — {formatCurrency(item.amount ?? null)}
                </li>
              ))}
            </ul>
            {lineItems.length > firstItems.length && (
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                And {lineItems.length - firstItems.length} more item
                {lineItems.length - firstItems.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
        )}
        <div className="space-y-3 text-sm text-slate-400">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Identifiers</p>
          <p>ID: {quote.id}</p>
          <p>Public token: {quote.public_token ?? "—"}</p>
        </div>
      </HbCard>
    </div>
  );
}
