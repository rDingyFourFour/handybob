import Link from "next/link";

import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";

export default function CallsNewPage() {
  return (
    <div className="hb-shell pt-20 pb-8 space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Calls</p>
        <h1 className="hb-heading-1 text-3xl font-semibold">Log a new call</h1>
        <p className="hb-muted text-sm">
          This screen is a placeholder; call logging will be wired up later.
        </p>
      </header>
      <HbCard className="space-y-4">
        <p className="text-sm text-slate-400">From number: _____________</p>
        <p className="text-sm text-slate-400">Related job: _____________</p>
        <p className="text-sm text-slate-400">Notes: _____________</p>
        <div className="flex gap-3">
          <HbButton as={Link} href="/calls" size="sm">
            Back to calls list
          </HbButton>
        </div>
      </HbCard>
    </div>
  );
}
