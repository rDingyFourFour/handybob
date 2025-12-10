export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { createServerClient } from "@/utils/supabase/server";
import { getCurrentWorkspace } from "@/lib/domain/workspaces";
import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import QuoteDetailsCard from "@/components/quotes/QuoteDetailsCard";
// CHANGE: import call script action at top of quote detail page

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

function formatServerDateLabel(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const headerActions = (
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
  );

  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <QuoteDetailsCard
        quoteId={quote.id}
        title={title}
        statusLabel={statusLabel}
        createdLabel={formatServerDateLabel(quote.created_at)}
        updatedLabel={formatServerDateLabel(quote.updated_at)}
        jobTitle={quote.job_id ? `Job ${quote.job_id.slice(0, 8)}` : null}
        customerDisplayName={null}
        isAiQuote={isAiQuote}
        headerActions={headerActions}
        lineItems={lineItems}
        clientMessageTemplate={quote.client_message_template}
        publicToken={quote.public_token}
        subtotal={quote.subtotal}
        tax={quote.tax}
        total={quote.total}
        acceptedAt={quote.accepted_at}
        paidAt={quote.paid_at}
        updatedAt={quote.updated_at}
      />
    </div>
  );
}
