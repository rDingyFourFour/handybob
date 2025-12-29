"use client";

import type { ReactNode } from "react";

import HbCard from "@/components/ui/hb-card";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";

type CompactStatusItem = {
  key: string;
  label: string;
  value: string;
};

type CallStatusCompactCardProps = {
  directionLabel: string;
  isInbound: boolean;
  fromLabel: string;
  toLabel: string;
  createdAtLabel: string;
  mainStatusLabel: string;
  mainStatusValue: string;
  statusBadgeLabel: string;
  statuses: CompactStatusItem[];
  details: ReactNode;
};

export default function CallStatusCompactCard({
  directionLabel,
  isInbound,
  fromLabel,
  toLabel,
  createdAtLabel,
  mainStatusLabel,
  mainStatusValue,
  statusBadgeLabel,
  statuses,
  details,
}: CallStatusCompactCardProps) {
  return (
    <HbCard className="space-y-4" data-testid="call-status-compact-card">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{directionLabel}</p>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-100">
          <span>
            {callSessionCopy.callControl.fromLabel}: {fromLabel}
          </span>
          <span className="text-slate-400">
            {callSessionCopy.callControl.toLabel}: {toLabel}
          </span>
          <span className="text-slate-400">
            {callSessionCopy.callControl.createdLabel} {createdAtLabel}
          </span>
          {isInbound && (
            <span className="inline-flex items-center rounded-full border border-slate-800/60 bg-slate-950/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-300">
              {callSessionCopy.callControl.inboundBadge}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">{mainStatusLabel}</p>
          <p className="text-lg font-semibold text-white">{mainStatusValue}</p>
        </div>
        <span className="rounded-full border border-slate-800/60 bg-slate-950/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300">
          {statusBadgeLabel}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3" data-testid="call-status-compact-statuses">
        {statuses.map((item) => (
          <div
            key={item.key}
            className="rounded-full border border-slate-800/60 bg-slate-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-300"
            data-testid={`call-status-chip-${item.key}`}
          >
            <span className="text-[10px] text-slate-500">{item.label}</span>
            <span className="block text-[11px] text-white">{item.value}</span>
          </div>
        ))}
      </div>

      <details className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-3" data-testid="call-status-details">
        <summary className="cursor-pointer text-[11px] uppercase tracking-[0.3em] text-slate-500">
          {callSessionCopy.statusStrip.title}
        </summary>
        <div className="mt-3 space-y-3 text-sm text-slate-300">{details}</div>
      </details>
    </HbCard>
  );
}
