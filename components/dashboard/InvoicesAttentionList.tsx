import type { ReactNode } from "react";

type Invoice = {
  id: string;
  status: string;
};

type InvoicesAttentionListProps = {
  items?: Invoice[];
  children?: ReactNode;
};

export function InvoicesAttentionList({ items }: InvoicesAttentionListProps) {
  if (!items || items.length === 0) {
    return <p className="hb-muted text-xs">No invoices need attention.</p>;
  }

  return (
    <ul className="space-y-2 text-sm text-slate-100">
      {items.map((invoice) => (
        <li key={invoice.id} className="flex items-center justify-between">
          <span className="font-semibold text-slate-200">#{invoice.id}</span>
          <span className="text-xs text-slate-400 uppercase tracking-[0.3em]">{invoice.status}</span>
        </li>
      ))}
    </ul>
  );
}
