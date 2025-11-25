import { AttentionListRow } from "./AttentionListRow";
import type { AttentionListRowData } from "@/lib/domain/attention";

type QuotesAttentionListProps = {
  items: AttentionListRowData[];
};

export function QuotesAttentionList({ items }: QuotesAttentionListProps) {
  if (items.length === 0) {
    return <p className="hb-muted text-xs">No quotes waiting.</p>;
  }

  return (
    <div className="space-y-0 divide-y divide-slate-800/70">
      {items.map((item) => (
        <AttentionListRow key={item.id} item={item} />
      ))}
    </div>
  );
}
