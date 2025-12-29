"use client";

import Link from "next/link";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";

type CallReferenceCardProps = {
  jobTitle: string;
  jobStatus: string;
  jobLink?: string;
  quoteLabel: string;
  quoteStatus?: string | null;
  quoteLink?: string;
  openMessagesHref?: string | null;
  jobHref?: string;
};

export default function CallReferenceCard({
  jobTitle,
  jobStatus,
  jobLink,
  quoteLabel,
  quoteStatus,
  quoteLink,
  openMessagesHref,
  jobHref,
}: CallReferenceCardProps) {
  return (
    <HbCard className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Reference</p>
        <h2 className="hb-heading-3 text-xl font-semibold text-white">Job & quote</h2>
        <p className="text-sm text-slate-400">Quick links and context for this call.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Job</p>
          {jobLink ? (
            <Link href={jobLink} className="text-lg font-semibold text-slate-100 hover:text-slate-200">
              {jobTitle}
            </Link>
          ) : (
            <p className="text-lg font-semibold text-slate-100">{jobTitle}</p>
          )}
          <p className="text-xs text-slate-400">{jobStatus}</p>
        </div>
        <div className="space-y-2 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Quote</p>
          {quoteLink ? (
            <Link href={quoteLink} className="text-lg font-semibold text-slate-100 hover:text-slate-200">
              {quoteLabel}
            </Link>
          ) : (
            <p className="text-lg font-semibold text-slate-100">{quoteLabel}</p>
          )}
          {quoteStatus && <p className="text-xs text-slate-400">Status: {quoteStatus}</p>}
        </div>
      </div>
      <div className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-950/60 p-3">
        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
          {callSessionCopy.secondaryActions.title}
        </p>
        <div className="flex flex-col gap-2">
          <HbButton
            as={Link}
            href={jobHref ?? "/jobs"}
            variant="ghost"
            size="sm"
            className="w-full"
          >
            {callSessionCopy.secondaryActions.openJob}
          </HbButton>
          <HbButton as={Link} href="/calls" variant="ghost" size="sm" className="w-full">
            {callSessionCopy.secondaryActions.openCalls}
          </HbButton>
          {openMessagesHref && (
            <HbButton
              as={Link}
              href={openMessagesHref}
              variant="ghost"
              size="sm"
              className="w-full"
            >
              {callSessionCopy.secondaryActions.openMessages}
            </HbButton>
          )}
        </div>
      </div>
    </HbCard>
  );
}
