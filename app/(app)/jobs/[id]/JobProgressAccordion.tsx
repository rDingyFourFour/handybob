"use client";

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";

import type { JobProgressStep } from "@/lib/domain/askbob/nextStep";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import type { JobProgressRowCopy } from "@/lib/domain/askbob/jobDetailsDerivedCopy";
import type { ProgressStepInfo } from "@/app/(app)/jobs/[id]/progressSteps";

type RowContentMap = Partial<Record<JobProgressStep, ReactNode>>;

type JobProgressAccordionProps = {
  progressSteps: ProgressStepInfo[];
  rowCopyByStep: Partial<Record<JobProgressStep, JobProgressRowCopy>>;
  rowContent: RowContentMap;
  openStepId: JobProgressStep | null;
  onOpenStepIdChange: (nextId: JobProgressStep | null) => void;
  defaultExpandedStep?: JobProgressStep | null;
  isMobile?: boolean;
};

export default function JobProgressAccordion({
  progressSteps,
  rowCopyByStep,
  rowContent,
  openStepId,
  onOpenStepIdChange,
  defaultExpandedStep,
  isMobile = false,
}: JobProgressAccordionProps) {
  void defaultExpandedStep;
  const stepAnchorMap = useMemo(
    () => new Map<JobProgressStep, string>(progressSteps.map((step) => [step.key, step.anchor])),
    [progressSteps],
  );

  const handleToggle = useCallback(
    (stepKey: JobProgressStep) => {
      if (openStepId === stepKey) {
        console.log("[job-details-progress-row-collapse]", { stepKey, isMobile });
        onOpenStepIdChange(null);
        return;
      }
      if (openStepId) {
        console.log("[job-details-progress-row-collapse]", { stepKey: openStepId, isMobile });
      }
      console.log("[job-details-progress-row-expand]", { stepKey, isMobile });
      onOpenStepIdChange(stepKey);
      if (typeof document === "undefined") {
        return;
      }
      const anchor = stepAnchorMap.get(stepKey);
      if (!anchor) {
        return;
      }
      const target = document.getElementById(anchor);
      if (!target || typeof target.scrollIntoView !== "function") {
        return;
      }
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [isMobile, openStepId, onOpenStepIdChange, stepAnchorMap],
  );

  return (
    <div data-testid="progress-accordion" className="space-y-3">
      {progressSteps.map((step) => {
        const isExpanded = openStepId === step.key;
        const rowCopy = rowCopyByStep[step.key];
        const stepLabelText =
          rowCopy?.stepLabel ?? step.label ?? jobDetailsCopy.disabled.safeFailure;
        const statusText = rowCopy?.statusText ?? jobDetailsCopy.disabled.safeFailure;
        const hintText = rowCopy?.hintText ?? null;
        const reviewLabel = rowCopy?.reviewActionLabel ?? jobDetailsCopy.progressRows.reviewAction;
        return (
          <section
            key={step.key}
            id={step.anchor}
            data-testid={`progress-row-${step.key}`}
            className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-4 shadow-sm"
          >
            <div
              data-testid={`progress-row-${step.key}-header`}
              className="flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {stepLabelText}
                </p>
                <p
                  data-testid={`progress-row-${step.key}-status`}
                  className="text-sm text-[var(--color-text-secondary)]"
                >
                  {statusText}
                </p>
                {hintText ? (
                  <p
                    data-testid={`progress-row-${step.key}-hint`}
                    className="text-xs text-[var(--color-text-secondary)]"
                  >
                    {hintText}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                id={`progress-row-${step.key}-toggle`}
                data-testid={`progress-row-${step.key}-toggle`}
                aria-expanded={isExpanded}
                aria-controls={`progress-row-${step.key}-content`}
                className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)]"
                onClick={() => handleToggle(step.key)}
              >
                {reviewLabel}
              </button>
            </div>
            <div
              id={`progress-row-${step.key}-content`}
              data-testid={`progress-row-${step.key}-content`}
              aria-hidden={!isExpanded}
              className={isExpanded ? "space-y-3" : "hidden"}
            >
              <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-elevated)] px-3 py-3">
                {rowContent[step.key] ?? null}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
