"use client";

import Link from "next/link";

import { dismissAttentionItem } from "@/app/actions/attention";

export type AttentionAction = {
  label: string;
  href: string;
  variant?: "ghost" | "solid";
};

export type AttentionListRowData = {
  id: string;
  primary: string;
  secondary?: string | null;
  tag?: string | null;
  amount?: string;
  meta?: string;
  actions?: AttentionAction[];
  dismissType?: "lead" | "quote" | "invoice" | "call";
  href: string;
};

export function AttentionListRow({ item }: { item: AttentionListRowData }) {
  return (
    <div className="rounded border border-slate-800 px-2 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <Link href={item.href} className="font-semibold underline-offset-2 hover:underline">
          {item.primary}
        </Link>
        {item.tag ? <span className="text-[11px] uppercase text-amber-300">{item.tag}</span> : null}
      </div>
      {item.amount && <p className="text-sm text-slate-200">Amount: {item.amount}</p>}
      {item.meta && <p className="text-xs text-slate-400">{item.meta}</p>}
      {item.secondary && <p className="hb-muted text-xs">{item.secondary}</p>}
      {item.actions?.length ? (
        <div className="flex flex-wrap gap-2 pt-2">
          {item.actions.map((action) => (
            <Link
              key={`${item.id}-${action.label}-${action.href}`}
              href={action.href}
              className={`text-[11px] ${
                action.variant === "solid" ? "hb-button px-2 py-1" : "hb-button-ghost px-2 py-1"
              }`}
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
      {item.dismissType && (
        <form action={dismissAttentionItem} className="pt-2">
          <input type="hidden" name="itemType" value={item.dismissType} />
          <input type="hidden" name="itemId" value={item.id} />
          <button type="submit" className="text-[11px] text-slate-400 hover:text-slate-200">
            Dismiss
          </button>
        </form>
      )}
    </div>
  );
}
