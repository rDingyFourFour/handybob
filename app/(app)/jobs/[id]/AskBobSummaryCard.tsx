"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import HbCard from "@/components/ui/hb-card";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import type { AskBobFollowupSnapshotPayload } from "@/lib/domain/askbob/types";
import type { JobProgressStep, NextStepResult, NextStepStatusHints } from "@/lib/domain/askbob/nextStep";

type ProgressStepInfo = {
  key: JobProgressStep;
  label: string;
  anchor: string;
};

type AskBobSummaryCardProps = {
  jobId: string;
  nextStep: NextStepResult;
  hasDiagnoseSnapshot: boolean;
  hasMaterialsSnapshot: boolean;
  hasQuoteSnapshot: boolean;
  followupSnapshot: AskBobFollowupSnapshotPayload | null;
  hasCallSummary: boolean;
  progressSteps: ProgressStepInfo[];
  statusHints: NextStepStatusHints;
};

export default function AskBobSummaryCard({
  jobId,
  nextStep,
  hasDiagnoseSnapshot,
  hasMaterialsSnapshot,
  hasQuoteSnapshot,
  followupSnapshot,
  hasCallSummary,
  progressSteps,
  statusHints,
}: AskBobSummaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const artifactLabels = useMemo(() => {
    const labels: string[] = [];
    if (hasDiagnoseSnapshot) {
      labels.push("Diagnosis");
    }
    if (hasMaterialsSnapshot) {
      labels.push("Materials");
    }
    if (hasQuoteSnapshot) {
      labels.push("Quote");
    }
    if (followupSnapshot) {
      labels.push("Follow-up plan");
    }
    if (hasCallSummary) {
      labels.push("Call summary");
    }
    return labels;
  }, [hasCallSummary, hasDiagnoseSnapshot, hasMaterialsSnapshot, hasQuoteSnapshot, followupSnapshot]);

  const collapsedCopy = useMemo(() => {
    if (artifactLabels.length === 0) {
      return "AskBob hasn’t generated any artifacts for this job yet.";
    }
    if (artifactLabels.length === 1) {
      return `AskBob has generated ${artifactLabels[0]}.`;
    }
    if (artifactLabels.length === 2) {
      return `AskBob has generated ${artifactLabels[0]} and ${artifactLabels[1]}.`;
    }
    const allButLast = artifactLabels.slice(0, -1).join(", ");
    const lastLabel = artifactLabels[artifactLabels.length - 1];
    return `AskBob has generated ${allButLast}, and ${lastLabel}.`;
  }, [artifactLabels]);

  const toggleExpanded = () => {
    setIsExpanded((value) => {
      const next = !value;
      if (next) {
        console.log("[job-details-askbob-summary-expanded]", {
          jobId,
          stepType: nextStep.stepType,
        });
      }
      return next;
    });
  };

  return (
    <HbCard className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {jobDetailsCopy.askBobSummary.collapsedHint}
        </p>
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 transition hover:text-slate-200"
          data-testid="job-details-askbob-summary-toggle"
        >
          {isExpanded ? "Hide details" : "View details"}
        </button>
      </div>
      {!isExpanded ? (
        <div data-testid="job-details-askbob-summary-collapsed" className="text-sm text-slate-300">
          {collapsedCopy}
        </div>
      ) : (
        <div data-testid="job-details-askbob-summary-expanded" className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            {jobDetailsCopy.askBobSummary.expandedHint}
          </p>
          <div className="space-y-3">
            {progressSteps.map((step) => (
              <div
                key={step.key}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-200">{step.label}</p>
                  <p className="text-sm text-slate-400">{statusHints[step.key]}</p>
                </div>
                <Link
                  href={`#${step.anchor}`}
                  className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 transition hover:text-slate-200"
                >
                  Review
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </HbCard>
  );
}
