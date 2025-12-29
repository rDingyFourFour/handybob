"use client";

import { useState } from "react";
import Link from "next/link";

import HbCard from "@/components/ui/hb-card";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import type { JobProgressStep, NextStepResult, NextStepStatusHints } from "@/lib/domain/askbob/nextStep";

type ProgressStepInfo = {
  key: JobProgressStep;
  label: string;
  anchor: string;
};

type AskBobSummaryCardProps = {
  jobId: string;
  nextStep: NextStepResult;
  progressSteps: ProgressStepInfo[];
  statusHints: NextStepStatusHints;
  collapsedCopy: string;
};

export default function AskBobSummaryCard({
  jobId,
  nextStep,
  progressSteps,
  statusHints,
  collapsedCopy,
}: AskBobSummaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded((value) => {
      const next = !value;
      if (next) {
        console.log("[job-details-askbob-summary-expanded]", {
          jobId,
          stepType: nextStep.stepType,
        });
      } else {
        console.log("[job-details-askbob-summary-collapsed]", {
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
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
          {jobDetailsCopy.askBobSummary.collapsedHint}
        </p>
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)]"
          data-testid="job-details-askbob-summary-toggle"
        >
          {isExpanded ? "Hide details" : "View details"}
        </button>
      </div>
      {!isExpanded ? (
        <div data-testid="job-details-askbob-summary-collapsed" className="text-sm text-[var(--color-text-secondary)]">
          {collapsedCopy}
        </div>
      ) : (
        <div data-testid="job-details-askbob-summary-expanded" className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
            {jobDetailsCopy.askBobSummary.expandedHint}
          </p>
          <div className="space-y-3">
            {progressSteps.map((step) => (
              <div
                key={step.key}
                className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{step.label}</p>
                  <p className="text-sm text-[var(--color-text-secondary)]">{statusHints[step.key]}</p>
                </div>
                <Link
                  href={`#${step.anchor}`}
                  className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)]"
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
