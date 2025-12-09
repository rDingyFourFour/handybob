"use client";

import { useEffect } from "react";

import HbCard from "@/components/ui/hb-card";
import AskBobForm from "./AskBobForm";
import type { AskBobResponseDTO } from "@/lib/domain/askbob/types";

export type JobDiagnosisContext = {
  diagnosisSummary: string | null;
  askBobResponseId?: string | null;
};

function buildDiagnosisSummary(response: AskBobResponseDTO): string | null {
  const normalizeItems = (sectionItems: string[]) =>
    sectionItems
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 2);

  const stepsSection =
    response.sections.find((section) => section.type === "steps" && section.items.some(Boolean)) ??
    response.sections.find((section) => section.items.some(Boolean));
  const stepItems = stepsSection ? normalizeItems(stepsSection.items) : [];
  const majorScope = stepItems.length ? `${stepsSection?.title ?? "Diagnosis"}: ${stepItems.join("; ")}` : null;

  const safetySection = response.sections.find(
    (section) => section.type === "safety" && section.items.some(Boolean),
  );
  const safetyItem = safetySection?.items.map((item) => item.trim()).find(Boolean) ?? null;

  const summaryParts = [];
  if (majorScope) {
    summaryParts.push(majorScope);
  }
  if (safetyItem) {
    summaryParts.push(`Safety note: ${safetyItem}`);
  }

  if (!summaryParts.length) {
    return null;
  }

  const summary = summaryParts.join(" ").trim();
  return summary.length ? summary : null;
}

type JobAskBobPanelProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  quoteId?: string | null;
  onDiagnoseSuccess?: () => void;
  onDiagnoseComplete?: (context: JobDiagnosisContext) => void;
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
  const labelsToShow: string[] = [];
  if (normalizedJobTitle) {
    labelsToShow.push("job title");
  }
  if (normalizedJobDescription) {
    labelsToShow.push("job description");
  }

  const handleResponse = (response: AskBobResponseDTO) => {
    const summary = buildDiagnosisSummary(response);
    onDiagnoseComplete?.({
      diagnosisSummary: summary,
      askBobResponseId: response.responseId,
    });
  };

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
        {labelsToShow.length > 0 ? (
          <p className="text-xs text-muted-foreground">Context used: {labelsToShow.join(", ")}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Context used: none yet. AskBob will use the job details you enter below.
          </p>
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
        onResponse={handleResponse}
      />
    </HbCard>
  );
}
