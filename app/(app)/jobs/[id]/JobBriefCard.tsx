import Link from "next/link";

import HbCard from "@/components/ui/hb-card";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";

type JobBriefCardProps = {
  title: string;
  customerName: string | null;
  stateLine: string;
};

export default function JobBriefCard({ title, customerName, stateLine }: JobBriefCardProps) {
  const heading = jobDetailsCopy.jobBrief.heading;
  return (
    <HbCard className="space-y-2">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">{heading}</p>
        <div className="flex items-start justify-between gap-3">
          <h1 className="hb-heading-2 text-2xl font-semibold text-[var(--color-text-primary)]">{title}</h1>
          <Link
            href="/jobs"
            className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)]"
          >
            {jobDetailsCopy.jobBrief.backToJobs}
          </Link>
        </div>
        {customerName ? (
          <p className="text-sm text-[var(--color-text-secondary)]">Customer: {customerName}</p>
        ) : null}
        <p className="text-sm font-medium text-[var(--color-text-primary)]" data-testid="job-brief-summary-line">
          {stateLine}
        </p>
      </div>
    </HbCard>
  );
}
