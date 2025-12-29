"use client";

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type {
  JobProgressStep,
  NextStepStatusHints,
} from "@/lib/domain/askbob/nextStep";
import type { ProgressStepInfo } from "@/app/(app)/jobs/[id]/progressSteps";

type RowContentMap = Partial<Record<JobProgressStep, ReactNode>>;

type JobProgressAccordionProps = {
  progressSteps: ProgressStepInfo[];
  statusHints: NextStepStatusHints;
  rowContent: RowContentMap;
  defaultExpandedStep?: JobProgressStep | null;
};

export default function JobProgressAccordion({
  progressSteps,
  statusHints,
  rowContent,
  defaultExpandedStep = null,
}: JobProgressAccordionProps) {
  const stepAnchorMap = useMemo(
    () => new Map<JobProgressStep, string>(progressSteps.map((step) => [step.key, step.anchor])),
    [progressSteps],
  );

  const [expandedStep, setExpandedStep] = useState<JobProgressStep | null>(() => defaultExpandedStep ?? null);

  const scrollToAnchor = useCallback(
    (stepKey: JobProgressStep) => {
      if (typeof document === "undefined") {
        return;
      }
      const anchor = stepAnchorMap.get(stepKey);
      if (!anchor) {
        return;
      }
      const target = document.getElementById(anchor);
      if (!target) {
        return;
      }
      if (typeof target.scrollIntoView !== "function") {
        return;
      }
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [stepAnchorMap],
  );

  const handleToggle = useCallback(
    (stepKey: JobProgressStep) => {
      setExpandedStep((current) => {
        if (current === stepKey) {
          console.log("[job-details-progress-row-collapse]", { stepKey });
          return null;
        }
        if (current) {
          console.log("[job-details-progress-row-collapse]", { stepKey: current });
        }
        console.log("[job-details-progress-row-expand]", { stepKey });
        return stepKey;
      });
      if (expandedStep !== stepKey) {
        scrollToAnchor(stepKey);
      }
    },
    [expandedStep, scrollToAnchor],
  );

  return (
    <div data-testid="progress-accordion" className="space-y-3">
      {progressSteps.map((step) => {
        const isExpanded = expandedStep === step.key;
        return (
          <section
            key={step.key}
            id={step.anchor}
            data-testid={`progress-row-${step.key}`}
            className="space-y-3 rounded-xl border border-slate-800/60 bg-slate-950/40 px-4 py-3 text-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-100">{step.label}</p>
                <p
                  data-testid={`progress-row-${step.key}-status`}
                  className="text-sm text-slate-400"
                >
                  {statusHints[step.key]}
                </p>
              </div>
              <button
                type="button"
                id={`progress-row-${step.key}-toggle`}
                data-testid={`progress-row-${step.key}-toggle`}
                aria-expanded={isExpanded}
                aria-controls={`progress-row-${step.key}-content`}
                className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 transition hover:text-slate-200"
                onClick={() => handleToggle(step.key)}
              >
                Review
              </button>
            </div>
            <div
              id={`progress-row-${step.key}-content`}
              data-testid={`progress-row-${step.key}-content`}
              aria-hidden={!isExpanded}
              className={isExpanded ? "space-y-3" : "hidden"}
            >
              {rowContent[step.key] ?? null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
