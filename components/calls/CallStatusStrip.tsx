import React from "react";

type CallStatusStripItem = {
  key: string;
  label: string;
  status: string;
  timestamp: string;
};

type CallStatusStripProps = {
  items: CallStatusStripItem[];
};

export default function CallStatusStrip({ items }: CallStatusStripProps) {
  return (
    <div
      data-testid="call-status-strip"
      className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-3"
    >
      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Call status</p>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/60 bg-slate-950/80 px-3 py-2 text-xs text-slate-200"
            data-testid={`call-status-strip-${item.key}`}
          >
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                {item.label}
              </span>
              <span className="block text-sm text-slate-100">{item.status}</span>
            </div>
            <span className="text-[10px] text-slate-500">{item.timestamp}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
