"use client";

import { useState } from "react";
import Link from "next/link";

import HbCard from "@/components/ui/hb-card";
import type { NextStepResult } from "@/lib/domain/askbob/nextStep";
import type { AskBobSummaryDisplayModel } from "@/lib/domain/askbob/jobDetailsDerivedCopy";

type AskBobSummaryCardProps = {
  jobId: string;
  nextStep: NextStepResult;
  summary: AskBobSummaryDisplayModel;
  initiallyCollapsed?: boolean;
  isMobile?: boolean;
};

export default function AskBobSummaryCard({
  jobId,
  nextStep,
  summary,
  initiallyCollapsed = true,
  isMobile = false,
}: AskBobSummaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(() => !initiallyCollapsed);

  const toggleExpanded = () => {
      setIsExpanded((value) => {
        const next = !value;
        if (next) {
          console.log("[job-details-askbob-summary-expanded]", {
            jobId,
            stepType: nextStep.stepType,
            isMobile,
          });
        } else {
          console.log("[job-details-askbob-summary-collapsed]", {
            jobId,
            stepType: nextStep.stepType,
            isMobile,
          });
        }
        return next;
      });
  };

  return (
    <HbCard className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
          {summary.collapsedHint}
        </p>
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)]"
          data-testid="job-details-askbob-summary-toggle"
        >
          {isExpanded ? summary.toggleLabels.collapse : summary.toggleLabels.expand}
        </button>
      </div>
      {!isExpanded ? (
        <div data-testid="job-details-askbob-summary-collapsed" className="text-sm text-[var(--color-text-secondary)]">
          {summary.collapsedLine}
        </div>
      ) : (
        <div data-testid="job-details-askbob-summary-expanded" className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
            {summary.expandedHint}
          </p>
          <div className="space-y-3">
            {summary.rows.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{row.label}</p>
                  <p className="text-sm text-[var(--color-text-secondary)]">{row.statusHint}</p>
                </div>
                <Link
                  href={`#${row.anchor}`}
                  className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)]"
                >
                  {row.reviewActionLabel}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </HbCard>
  );
}
