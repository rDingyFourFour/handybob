"use client";

import type { ReactNode } from "react";

import HbCard from "@/components/ui/hb-card";
import CallSummaryStatus from "@/components/call-summary-status";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";

type WrapUpFlowCardProps = {
  customerName: string | null;
  callFromLabel: string;
  callToLabel: string;
  createdAtLabel: string;
  callSummary: string;
  summaryMissing: boolean;
  jobLink?: string;
  jobTitle?: string | null;
  jobStatus?: string | null;
  showInProgressBanner: boolean;
  showOutcomeRequiredBanner: boolean;
  callId: string;
  outcomePanel: ReactNode;
  followUpPanel: ReactNode | null;
  enrichmentPanel: ReactNode;
  summaryHint?: string | null;
};

export default function WrapUpFlowCard({
  customerName,
  callFromLabel,
  callToLabel,
  createdAtLabel,
  callSummary,
  summaryMissing,
  jobLink,
  jobTitle,
  jobStatus,
  showInProgressBanner,
  showOutcomeRequiredBanner,
  callId,
  summaryHint,
  outcomePanel,
  followUpPanel,
  enrichmentPanel,
}: WrapUpFlowCardProps) {
  return (
    <HbCard id="call-wrapup" data-testid="call-wrap-up-card" className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {callSessionCopy.wrapUp.badge}
        </p>
        <h2 className="hb-heading-3 text-xl font-semibold text-white">
          {callSessionCopy.wrapUp.title}
        </h2>
        <p className="text-sm text-slate-400">{callSessionCopy.wrapUp.helper}</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-200">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call summary</p>
          <h3 className="hb-heading-3 text-lg font-semibold text-white">Call summary</h3>
          <p className="text-sm text-slate-400">
            Review what happened on the call before capturing the final outcome.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-200">
          {customerName && <span>Customer: {customerName}</span>}
          <span>From: {callFromLabel}</span>
          <span>To: {callToLabel}</span>
          <span>Created {createdAtLabel}</span>
        </div>
        <p className="text-sm text-slate-200">{callSummary}</p>
        <div className="flex items-center gap-3">
          <CallSummaryStatus
            callId={callId}
            initialStatus={summaryMissing ? "needed" : "recorded"}
          />
          {summaryMissing && (
            <p className="text-xs text-slate-400">
              No summary recorded yet. Capture it in the manual workspace.
            </p>
          )}
        </div>
        {summaryHint && <p className="text-xs text-slate-400">{summaryHint}</p>}
        {jobTitle && jobStatus && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Job:</span>
            {jobLink ? (
              <a href={jobLink} className="font-semibold text-slate-100 hover:text-slate-200">
                {jobTitle}
              </a>
            ) : (
              <span className="font-semibold text-slate-100">{jobTitle}</span>
            )}
            <span className="rounded-full border border-slate-800/60 bg-slate-900/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-slate-400">
              {jobStatus}
            </span>
          </div>
        )}
      </div>

      {showInProgressBanner && (
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-3 text-xs text-slate-200">
          {callSessionCopy.wrapUp.outcome.inProgressBanner}
        </div>
      )}
      {showOutcomeRequiredBanner && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
          {callSessionCopy.wrapUp.outcomeRequiredBanner}
        </div>
      )}

      <div id="call-outcome-capture">{outcomePanel}</div>

      {followUpPanel && <div id="askbob-after-call">{followUpPanel}</div>}

      <div id="post-call-enrichment">{enrichmentPanel}</div>
    </HbCard>
  );
}
