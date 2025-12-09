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

  const normalizedJobTitle = jobTitle?.trim() ?? "";
  const normalizedJobDescription = jobDescription?.trim() ?? "";
  const contextLabels: string[] = [];
  if (normalizedJobTitle) {
    contextLabels.push("Job title");
  }
  if (normalizedJobDescription) {
    contextLabels.push("Job description");
  }

  return (
    <HbCard className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob</p>
        <h2 className="hb-heading-3 text-xl font-semibold">Step 1 · Diagnose the job</h2>
        <p className="text-sm text-slate-400">
          AskBob uses the job title, description, and your notes to outline how a technician might approach this job safely.
          Review and adjust these steps based on what you see on site.
        </p>
        <p className="text-xs text-slate-500">These steps are suggestions, not a script—edit them freely.</p>
        {contextLabels.length > 0 && (
          <p className="text-xs text-muted-foreground">Context used: {contextLabels.join(" · ")}</p>
        )}
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
