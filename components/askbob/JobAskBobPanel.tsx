"use client";

import { useEffect, useState } from "react";

import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
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
  stepCompleted?: boolean;
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
  stepCompleted,
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
  const [latestAskBobResponse, setLatestAskBobResponse] = useState<AskBobResponseDTO | null>(null);
  const [latestDiagnosisSummary, setLatestDiagnosisSummary] = useState<string | null>(null);
  const labelsToShow: string[] = [];
  if (normalizedJobTitle) {
    labelsToShow.push("job title");
  }
  if (normalizedJobDescription) {
    labelsToShow.push("job description");
  }

  const handleResponse = (response: AskBobResponseDTO) => {
    const summary = buildDiagnosisSummary(response);
    setLatestAskBobResponse(response);
    setLatestDiagnosisSummary(summary);
    onDiagnoseComplete?.({
      diagnosisSummary: summary,
      askBobResponseId: response.responseId,
    });
  };

  const handleReset = () => {
    setLatestAskBobResponse(null);
    setLatestDiagnosisSummary(null);
    onDiagnoseComplete?.({ diagnosisSummary: null });
    if (typeof document === "undefined") {
      return;
    }
    const target = document.getElementById("askbob-diagnose");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const hasDiagnosisResult = Boolean(latestAskBobResponse && latestDiagnosisSummary);

  return (
    <HbCard className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob</p>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <h2 className="hb-heading-3 text-xl font-semibold">Step 2 · Diagnose the job</h2>
            {stepCompleted && (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold tracking-[0.3em] text-emerald-200">
                Done
              </span>
            )}
          </div>
          {hasDiagnosisResult && (
            <HbButton
              variant="ghost"
              size="sm"
              className="px-2 py-0.5 text-[11px] tracking-[0.3em]"
              onClick={handleReset}
            >
              Reset this step
            </HbButton>
          )}
        </div>
        <p className="text-sm text-slate-400">
          AskBob reviews the job title, description, and your notes to outline how a technician might approach this job safely.
          Confirm site conditions and adjust these recommendations before you act.
        </p>
        <p className="text-xs text-slate-500">
          These are editable starting points—adapt them to the crew and conditions on site.
        </p>
        {labelsToShow.length > 0 ? (
          <p className="text-xs text-muted-foreground">Context used: {labelsToShow.join(", ")}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Context used: none yet. Add the job details below so AskBob can reference them.
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
