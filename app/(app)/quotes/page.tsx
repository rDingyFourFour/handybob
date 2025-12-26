export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { mapWorkspaceResultToRouteOutcome, resolveWorkspaceContext } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import QuotesListClient, { type QuoteRowType } from "@/components/quotes/QuotesListClient";

type QuoteRow = {
  id: string;
  status: string | null;
  total: number | null;
  created_at: string | null;
  job_id: string | null;
  client_message_template?: string | null;
  smart_quote_used?: boolean | null;
};

export default async function QuotesPage() {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch (error) {
    console.error("[quotes] Failed to initialize Supabase client:", error);
    return (
      <div className="hb-shell pt-20 pb-8 space-y-6">
        <HbCard className="space-y-3">
          <h1 className="hb-heading-1 text-2xl font-semibold">Something went wrong</h1>
          <p className="hb-muted text-sm">We couldn’t load this page. Try again or go back.</p>
        </HbCard>
      </div>
    );
  }

  try {
    const workspaceResult = await resolveWorkspaceContext({
      supabase,
      allowAutoCreateWorkspace: false,
    });
    const routeOutcome = mapWorkspaceResultToRouteOutcome(workspaceResult);
    if (routeOutcome?.redirectToLogin) {
      redirect("/login");
      return null;
    }
    if (routeOutcome?.showAccessDenied) {
      return (
        <div className="hb-shell pt-20 pb-8 space-y-6">
          <HbCard className="space-y-3">
            <h1 className="hb-heading-1 text-2xl font-semibold">Access denied</h1>
            <p className="hb-muted text-sm">{routeOutcome.message}</p>
          </HbCard>
        </div>
      );
    }
    if (!workspaceResult.ok) {
      return (
        <div className="hb-shell pt-20 pb-8 space-y-6">
          <HbCard className="space-y-3">
            <h1 className="hb-heading-1 text-2xl font-semibold">Something went wrong</h1>
            <p className="hb-muted text-sm">We couldn’t load this page. Try again or go back.</p>
          </HbCard>
        </div>
      );
    }
    const workspace = workspaceResult.membership.workspace;
    const user = workspaceResult.membership.user;
    const workspaceName = workspace.name ?? "Workspace";

    let quotes: QuoteRow[] = [];
    let quotesError: unknown = null;
    try {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, status, total, created_at, job_id, client_message_template, smart_quote_used")
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

    if (!quotesError) {
      const aiCount = quotes.reduce(
        (count, quote) => (quote.smart_quote_used ? count + 1 : count),
        0,
      );
      const manualCount = quotes.length - aiCount;
      console.log("[smart-quote-metrics] quotes list badges", {
        count: quotes.length,
        aiCount,
        manualCount,
      });
    }

    const dateFormatter = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    const currencyFormatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const formatDateLabel = (value: string | null) => {
      if (!value) return "—";
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return "—";
      return dateFormatter.format(parsed);
    };
    const formatTotalLabel = (value: number | null) => {
      if (value == null) return "—";
      const numeric = Number(value);
      if (Number.isNaN(numeric)) return "—";
      return `$${currencyFormatter.format(numeric)}`;
    };

    const initialQuotes: QuoteRowType[] = quotes.map((quote) => ({
      id: quote.id,
      status: quote.status ?? null,
      totalLabel: formatTotalLabel(quote.total),
      createdLabel: formatDateLabel(quote.created_at),
      jobId: quote.job_id ?? null,
      clientMessageTemplate: quote.client_message_template ?? null,
      smartQuoteUsed: Boolean(quote.smart_quote_used),
    }));

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
        ) : (
          <QuotesListClient initialQuotes={initialQuotes} />
        )}
      </div>
    );
  } catch (error) {
    console.error("[quotes] Failed to resolve workspace:", error);
    return (
      <div className="hb-shell pt-20 pb-8 space-y-6">
        <HbCard className="space-y-3">
          <h1 className="hb-heading-1 text-2xl font-semibold">Something went wrong</h1>
          <p className="hb-muted text-sm">We couldn’t load this page. Try again or go back.</p>
        </HbCard>
      </div>
    );
  }
}
