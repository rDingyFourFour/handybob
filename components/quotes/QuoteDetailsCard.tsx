"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import type { AskBobLineExplanation } from "@/lib/domain/askbob/types";
import { ExplainQuoteWithAskBobResult, explainQuoteWithAskBobAction } from "@/app/(app)/quotes/askbob-explain-actions";

type QuoteLineItem = {
  description?: string;
  amount?: number | null;
};

type QuoteDetailsCardProps = {
  quoteId: string;
  title?: string | null;
  statusLabel?: string | null;
  createdLabel?: string | null;
  updatedLabel?: string | null;
  jobTitle?: string | null;
  customerDisplayName?: string | null;
  isAiQuote?: boolean;
  headerActions?: ReactNode;
  lineItems?: QuoteLineItem[] | null;
  clientMessageTemplate?: string | null;
  publicToken?: string | null;
  subtotal?: number | null;
    tax?: number | null;
  total?: number | null;
  acceptedAt?: string | null;
  paidAt?: string | null;
  updatedAt?: string | null;
  askBobExplanation?: string | null;
  askBobLineExplanations?: AskBobLineExplanation[] | null;
  onExplainWithAskBob?: () => Promise<ExplainQuoteWithAskBobResult>;
  children?: ReactNode;
};

const smartQuoteBadgeClasses =
  "inline-flex items-center gap-2 rounded-full border px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.3em] bg-amber-500/10 border-amber-400/40 text-amber-300";
const smartQuoteBadgeDotClasses = "h-1.5 w-1.5 rounded-full bg-amber-300";
const COLLAPSED_HINT_KEY = "hb_quote_details_collapsed_hint_seen";

export default function QuoteDetailsCard({
  quoteId,
  title,
  statusLabel,
  createdLabel,
  updatedLabel,
  jobTitle,
  customerDisplayName,
  isAiQuote,
  headerActions,
  lineItems,
  clientMessageTemplate,
  publicToken,
  subtotal,
  tax,
  total,
  acceptedAt,
  paidAt,
  updatedAt,
  askBobExplanation,
  askBobLineExplanations,
  onExplainWithAskBob,
  children,
}: QuoteDetailsCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showCollapsedHint, setShowCollapsedHint] = useState(false);
  const [askBobExplanationState, setAskBobExplanationState] = useState<string | null | undefined>(
    askBobExplanation ?? null,
  );
  const [lineDetails, setLineDetails] = useState<AskBobLineExplanation[] | null>(
    askBobLineExplanations ?? null,
  );
  const [isExplaining, setIsExplaining] = useState(false);
  const [askBobError, setAskBobError] = useState<string | null>(null);
  const [showLineDetails, setShowLineDetails] = useState(false);
  const [showOriginalMessage, setShowOriginalMessage] = useState(false);

  const toggleLabel = useMemo(
    () => (collapsed ? "Show quote details ▼" : "Hide quote details ▲"),
    [collapsed],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const seen = window.localStorage.getItem(COLLAPSED_HINT_KEY);
      if (!seen) {
        queueMicrotask(() => setShowCollapsedHint(true));
      }
    } catch {
      queueMicrotask(() => setShowCollapsedHint(true));
    }
  }, []);

  useEffect(() => {
    if (askBobExplanation !== undefined) {
      setAskBobExplanationState(askBobExplanation ?? null);
    }
  }, [askBobExplanation]);

  useEffect(() => {
    if (askBobLineExplanations !== undefined) {
      setLineDetails(askBobLineExplanations ?? null);
    }
  }, [askBobLineExplanations]);

  useEffect(() => {
    if (!askBobExplanationState) {
      setShowOriginalMessage(false);
    }
  }, [askBobExplanationState]);

  const markHintSeen = () => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(COLLAPSED_HINT_KEY, "true");
    } catch {
    }
  };

  const handleToggle = () => {
    if (showCollapsedHint) {
      setShowCollapsedHint(false);
      markHintSeen();
    }
    setCollapsed((value) => !value);
  };

  const handleExplainWithAskBob = useCallback(async () => {
    setAskBobError(null);
    setIsExplaining(true);
    try {
      const result = onExplainWithAskBob
        ? await onExplainWithAskBob()
        : await explainQuoteWithAskBobAction({ quoteId });
      if (!result.ok) {
        setAskBobError(result.error ?? "AskBob couldn’t explain this quote. Please try again.");
        return;
      }
      setAskBobExplanationState(result.explanation);
      setLineDetails(result.lineExplanations ?? null);
      setShowOriginalMessage(false);
    } catch (error) {
      console.error("[askbob-quote-explain-ui] client error", error);
      setAskBobError("AskBob couldn’t explain this quote. Please try again.");
    } finally {
      setIsExplaining(false);
    }
  }, [onExplainWithAskBob, quoteId]);

  const lineItemsList = Array.isArray(lineItems) ? lineItems : [];
  const storedClientMessage = clientMessageTemplate?.trim()
    ? clientMessageTemplate
    : null;
  const activeClientMessage = askBobExplanationState ?? storedClientMessage;
  const hasStoredMessage = Boolean(storedClientMessage);
  const clientMessageDescription = askBobExplanationState
    ? "AskBob’s explanation drives the message you share with clients."
    : "The stored client message template will stay until you run AskBob.";
  const subtotalLabel = formatQuoteCurrency(subtotal ?? 0);
  const taxLabel = formatQuoteCurrency(tax ?? 0);
  const totalLabelFormatted = formatQuoteCurrency(total ?? 0);
  const headerTotalLabel = total != null ? formatQuoteCurrency(total) : null;
  const jobCustomerLine = jobTitle
    ? customerDisplayName
      ? `${jobTitle} for ${customerDisplayName}`
      : jobTitle
    : customerDisplayName
      ? `for ${customerDisplayName}`
      : null;
  const displayTitle = title?.trim() ? title : `Quote ${quoteId.slice(0, 8)}`;

  return (
    <HbCard className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Quote details</p>
                <h1 className="hb-heading-2 text-2xl font-semibold">{displayTitle}</h1>
              </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                  <span>Status: {statusLabel ?? "—"}</span>
                  {headerTotalLabel ? <span>Total: {headerTotalLabel}</span> : null}
                  {updatedLabel ? <span>Updated: {updatedLabel}</span> : null}
                </div>
              {createdLabel && (
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Created: {createdLabel}</p>
              )}
              {jobCustomerLine && <p className="text-sm text-slate-400">{jobCustomerLine}</p>}
              {showCollapsedHint && !collapsed && (
                <p className="text-xs text-slate-400">
                  Quote details are open by default; collapse this panel when you need more room to work.
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-3">
              {isAiQuote && (
                <span className={smartQuoteBadgeClasses}>
                  <span className={smartQuoteBadgeDotClasses} />
                  Smart Quote
                </span>
              )}
              {headerActions}
              <button
                type="button"
                className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 transition hover:text-slate-200"
                onClick={handleToggle}
                aria-expanded={!collapsed}
              >
                {toggleLabel}
              </button>
            </div>
          </div>
        </div>
      </header>
      {!collapsed && (
        <div className="space-y-5">
          <div className="space-y-2 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Line items</p>
            {lineItemsList.length > 0 ? (
              <div className="space-y-2">
                {lineItemsList.map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span>{item.description ?? `Item ${index + 1}`}</span>
                    <span className="font-semibold text-slate-100">
                      {formatQuoteCurrency(item.amount ?? null)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No line items have been added to this quote yet.</p>
            )}
          </div>
          <div className="space-y-2 text-sm text-slate-300">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Client message</p>
                <p className="text-sm text-slate-400">{clientMessageDescription}</p>
              </div>
              <HbButton
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleExplainWithAskBob}
                disabled={isExplaining}
              >
                {isExplaining ? "Generating explanation…" : "Explain this quote with AskBob"}
              </HbButton>
            </div>
            {askBobError && <p className="text-sm text-rose-400">{askBobError}</p>}
            <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
              {activeClientMessage ? (
                <p className="text-sm text-slate-100">{activeClientMessage}</p>
              ) : (
                <p className="text-sm text-slate-500">
                  No client message yet. Use AskBob to generate one for the customer.
                </p>
              )}
              {lineDetails && lineDetails.length > 0 && (
                <div className="space-y-2">
                  <button
                    type="button"
                    className="text-xs uppercase tracking-[0.3em] text-slate-400 underline-offset-4 hover:text-slate-200"
                    onClick={() => setShowLineDetails((prev) => !prev)}
                  >
                    {showLineDetails ? "Hide line-by-line details" : "Show line-by-line details"}
                  </button>
                  {showLineDetails && (
                    <ul className="space-y-2 text-sm text-slate-300">
                      {lineDetails.map((line) => (
                        <li key={`line-${line.lineIndex}`}>
                          <strong className="text-slate-100">Line {line.lineIndex + 1}:</strong>{" "}
                          {line.explanation}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {askBobExplanationState && (
                <p className="text-xs text-slate-500">
                  This explanation is AI-generated—review and edit before sharing with customers.
                </p>
              )}
              {askBobExplanationState && hasStoredMessage && (
                <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300">
                  <button
                    type="button"
                    className="text-xs uppercase tracking-[0.3em] text-slate-400 underline-offset-4 hover:text-slate-200"
                    onClick={() => setShowOriginalMessage((prev) => !prev)}
                  >
                    {showOriginalMessage ? "Hide original client message" : "Show original client message"}
                  </button>
                  {showOriginalMessage && (
                    <p className="text-sm text-slate-300">{storedClientMessage}</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Totals</p>
            <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-3">
              <p>
                <span className="font-semibold">Subtotal:</span> {subtotalLabel}
              </p>
              <p>
                <span className="font-semibold">Tax:</span> {taxLabel}
              </p>
              <p>
                <span className="font-semibold">Total:</span> {totalLabelFormatted}
              </p>
            </div>
          </div>
          <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-3">
            <p>
              <span className="font-semibold">Accepted:</span> {formatQuoteDate(acceptedAt ?? null)}
            </p>
            <p>
              <span className="font-semibold">Paid:</span> {formatQuoteDate(paidAt ?? null)}
            </p>
            <p>
              <span className="font-semibold">Updated:</span> {formatQuoteDate(updatedAt ?? null)}
            </p>
          </div>
          <div className="space-y-3 text-sm text-slate-400">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Identifiers</p>
            <p>ID: {quoteId}</p>
            <p>Public token: {publicToken ?? "—"}</p>
          </div>
          {children}
        </div>
      )}
    </HbCard>
  );
}

export function formatQuoteDate(value: string | null) {
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

export function formatQuoteCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}
