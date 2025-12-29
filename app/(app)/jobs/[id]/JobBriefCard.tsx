import Link from "next/link";

import HbCard from "@/components/ui/hb-card";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";

type JobBriefCardProps = {
  title: string;
  customerName: string | null;
  stateLine: string;
};

export default function JobBriefCard({ title, customerName, stateLine }: JobBriefCardProps) {
  return (
    <HbCard className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{jobDetailsCopy.jobBrief.heading}</p>
        <h1 className="hb-heading-2 text-2xl font-semibold">{title}</h1>
        {customerName ? (
          <p className="text-sm text-slate-400">Customer: {customerName}</p>
        ) : null}
        <p className="text-sm text-slate-300" data-testid="job-brief-summary-line">
          {jobDetailsCopy.jobBrief.stateLabel}: {stateLine}
        </p>
      </div>
      <div>
        <Link
          href="/jobs"
          className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-300"
        >
          {jobDetailsCopy.jobBrief.backToJobs}
        </Link>
      </div>
    </HbCard>
  );
}
