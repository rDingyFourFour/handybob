import { AttentionListRow } from "./AttentionListRow";
import type { AttentionListRowData } from "@/lib/domain/attention";

type CallsAttentionListProps = {
  items: AttentionListRowData[];
};

export function CallsAttentionList({ items }: CallsAttentionListProps) {
  if (items.length === 0) {
    return <p className="hb-muted text-xs">All calls processed.</p>;
  }

  return (
    <div className="space-y-0 divide-y divide-slate-800/70">
      {items.map((item) => (
        <AttentionListRow key={item.id} item={item} />
      ))}
    </div>
  );
}
