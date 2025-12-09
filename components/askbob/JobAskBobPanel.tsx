"use client";

import { useEffect } from "react";

import HbCard from "@/components/ui/hb-card";
import AskBobForm from "./AskBobForm";
import type { AskBobResponseDTO } from "@/lib/domain/askbob/types";

type JobAskBobPanelProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  quoteId?: string | null;
  onDiagnoseSuccess?: () => void;
  onDiagnoseComplete?: (response: AskBobResponseDTO) => void;
  jobDescription?: string | null;
  jobTitle?: string | null;
};

export default function JobAskBobPanel({
  workspaceId,
  jobId,
  customerId,
  quoteId,
  onDiagnoseSuccess,
  onDiagnoseComplete,
  jobDescription,
  jobTitle,
}: JobAskBobPanelProps) {
  useEffect(() => {
    console.log("[askbob-ui-entry]", {
      workspaceId,
      jobId,
      hasCustomerId: Boolean(customerId),
      hasJobTitle: Boolean(jobTitle?.trim()),
      origin: "job-detail",
    });
  }, [workspaceId, jobId, customerId, jobTitle]);

  return (
    <HbCard className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob</p>
        <h2 className="hb-heading-3 text-xl font-semibold">Job assistant</h2>
        <p className="text-sm text-slate-400">
          Start here to understand the problem before quoting, ordering materials, or following up with the customer.
        </p>
      </div>
      <AskBobForm
        workspaceId={workspaceId}
        jobId={jobId}
        customerId={customerId ?? undefined}
        quoteId={quoteId ?? undefined}
        jobDescription={jobDescription}
        jobTitle={jobTitle}
        onSuccess={onDiagnoseSuccess}
        onResponse={onDiagnoseComplete}
      />
    </HbCard>
  );
}
