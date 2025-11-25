import { AttentionListRow } from "./AttentionListRow";
import type { AttentionListRowData } from "@/lib/domain/attention";

type InvoicesAttentionListProps = {
  items: AttentionListRowData[];
};

export function InvoicesAttentionList({ items }: InvoicesAttentionListProps) {
  if (items.length === 0) {
    return <p className="hb-muted text-xs">No overdue invoices.</p>;
  }

  return (
    <div className="space-y-0 divide-y divide-slate-800/70">
      {items.map((item) => (
        <AttentionListRow key={item.id} item={item} />
      ))}
    </div>
  );
}
