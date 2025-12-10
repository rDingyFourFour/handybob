"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";

type JobDetailsCardProps = {
  jobId: string;
  title: string;
  status: string | null;
  quoteHref: string;
  acceptedQuoteId?: string | null;
  scheduleVisitHref: string;
  unseenFollowupLabel: string | null;
  followupDueLabel: string;
  followupStatusClass: string;
  urgency: string | null;
  source: string | null;
  aiUrgency: string | null;
  priority: string | null;
  attentionReason: string | null;
  attentionScore: number | null;
  createdLabel: string;
  customerId?: string | null;
  customerName?: string | null;
  description?: string | null;
};

const COLLAPSED_HINT_KEY = "hb_job_details_collapsed_hint_seen";

export default function JobDetailsCard({
  jobId,
  title,
  status,
  quoteHref,
  acceptedQuoteId,
  scheduleVisitHref,
  unseenFollowupLabel,
  followupDueLabel,
  followupStatusClass,
  urgency,
  source,
  aiUrgency,
  priority,
  attentionReason,
  attentionScore,
  createdLabel,
  customerId,
  customerName,
  description,
}: JobDetailsCardProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [showCollapsedHint, setShowCollapsedHint] = useState(false);
  const toggleLabel = useMemo(
    () => (collapsed ? "Show job details ▼" : "Hide job details ▲"),
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
    if (collapsed) {
      setShowCollapsedHint(false);
      markHintSeen();
    }
    setCollapsed((value) => !value);
  };

  return (
    <HbCard className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Job details</p>
                <h1 className="hb-heading-2 text-2xl font-semibold">{title}</h1>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                <span>Status: {status ?? "—"}</span>
                <span>{followupDueLabel}</span>
                {unseenFollowupLabel ? (
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.3em] font-semibold ${followupStatusClass}`}
                  >
                    {unseenFollowupLabel}
                  </span>
                ) : null}
              </div>
              {showCollapsedHint && collapsed && (
                <p className="text-xs text-slate-400">
                  Job details start collapsed. Click &quot;Show job details&quot; to see more.
                </p>
              )}
            </div>
            <button
              type="button"
              className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 transition hover:text-slate-200"
              onClick={handleToggle}
              aria-expanded={!collapsed}
            >
              {toggleLabel}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {customerId && customerName ? (
              <Link
                href={`/customers/${customerId}`}
                className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs font-semibold text-slate-100 transition hover:border-slate-600 hover:bg-slate-900"
              >
                <span className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Customer</span>
                <span className="text-sm">{customerName}</span>
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-800 bg-slate-950/60 px-3 py-1 text-xs uppercase tracking-[0.3em] text-slate-500">
                Attach customer (coming soon)
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <HbButton as={Link} href={quoteHref} size="sm" variant="secondary">
            Generate quote from job
          </HbButton>
          {acceptedQuoteId && (
            <HbButton
              as={Link}
              href={`/invoices/new?jobId=${jobId}&quoteId=${acceptedQuoteId}`}
              size="sm"
              variant="secondary"
            >
              Create invoice
            </HbButton>
          )}
          <HbButton as={Link} href={scheduleVisitHref} size="sm" variant="secondary">
            Schedule visit
          </HbButton>
          <HbButton as="a" href="/jobs" size="sm">
            Back to jobs
          </HbButton>
        </div>
      </header>
      {!collapsed && (
        <>
          {unseenFollowupLabel ? (
            <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-200">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Next follow-up</p>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.3em] font-semibold ${followupStatusClass}`}
                >
                  {unseenFollowupLabel}
                </span>
                <span className="text-sm text-slate-300">{followupDueLabel}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-200">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Next follow-up</p>
              <p className="text-sm text-slate-400">
                No calls yet – record one in the Calls tab to track follow-up status.
              </p>
            </div>
          )}
          <div className="grid gap-3 text-sm text-slate-400 md:grid-cols-2">
            <p>Urgency: {urgency ?? "—"}</p>
            <p>Source: {source ?? "—"}</p>
            <p>AI urgency: {aiUrgency ?? "—"}</p>
            <p>Priority: {priority ?? "—"}</p>
            <p>Attention reason: {attentionReason ?? "—"}</p>
            <p>Attention score: {attentionScore ?? "—"}</p>
            <p>Created: {createdLabel}</p>
            {customerName && customerId && (
              <p>
                Customer:{" "}
                <Link href={`/customers/${customerId}`} className="text-sky-300 hover:text-sky-200">
                  {customerName}
                </Link>
              </p>
            )}
          </div>
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Description:</p>
            <p className="text-sm text-slate-300">{description ?? "No description provided."}</p>
          </div>
        </>
      )}
    </HbCard>
  );
}
