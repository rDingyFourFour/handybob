"use client";

import { useEffect } from "react";

import HbCard from "@/components/ui/hb-card";
import AskBobForm from "./AskBobForm";

type JobAskBobPanelProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  quoteId?: string | null;
};

export default function JobAskBobPanel({
  workspaceId,
  jobId,
  customerId,
  quoteId,
}: JobAskBobPanelProps) {
  useEffect(() => {
    console.log("[askbob-ui-entry]", {
      workspaceId,
      jobId,
      hasCustomerId: Boolean(customerId),
      origin: "job-detail",
    });
  }, [workspaceId, jobId, customerId]);

  return (
    <HbCard className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob</p>
        <h2 className="hb-heading-3 text-xl font-semibold">Job assistant</h2>
        <p className="text-sm text-slate-400">
          Ask job-specific questions and turn the results into notes on this job.
        </p>
      </div>
      <AskBobForm
        workspaceId={workspaceId}
        jobId={jobId}
        customerId={customerId ?? undefined}
        quoteId={quoteId ?? undefined}
      />
    </HbCard>
  );
}
