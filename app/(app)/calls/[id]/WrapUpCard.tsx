import type { ReactNode } from "react";

import HbCard from "@/components/ui/hb-card";

type WrapUpCardProps = {
  summarySection: ReactNode;
  outcomeBanner?: ReactNode;
  outcomeSection: ReactNode;
  followupLinkSection?: ReactNode;
  afterCallSection?: ReactNode;
  enrichmentSection?: ReactNode;
  metaSection?: ReactNode;
};

export default function WrapUpCard({
  summarySection,
  outcomeBanner,
  outcomeSection,
  followupLinkSection,
  afterCallSection,
  enrichmentSection,
  metaSection,
}: WrapUpCardProps) {
  return (
    <HbCard id="call-wrap-up" data-testid="call-wrap-up-card" className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Wrap-up</p>
        <h2 className="hb-heading-3 text-xl font-semibold text-white">Call wrap-up</h2>
        <p className="text-sm text-slate-400">
          Capture the outcome, generate follow-up, and add enrichment in one place.
        </p>
      </div>
      {summarySection}
      {outcomeBanner}
      {outcomeSection}
      {followupLinkSection}
      {afterCallSection}
      {enrichmentSection}
      {metaSection}
    </HbCard>
  );
}
