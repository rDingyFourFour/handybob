"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import { openOrCreateCallSessionForJobAction } from "@/app/(app)/jobs/actions/openOrCreateCallSessionForJobAction";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import { PROGRESS_STEP_ANCHORS } from "@/lib/domain/askbob/progressSteps";
import type { JobProgressStep, NextStepResult } from "@/lib/domain/askbob/nextStep";

const NEXT_STEP_PROGRESS_EVENT = "job-details-next-step-progress";
const PROGRESS_ANCHOR_TO_STEP_MAP = new Map<string, JobProgressStep>(
  (Object.entries(PROGRESS_STEP_ANCHORS) as Array<[JobProgressStep, string]>).map(
    ([step, anchor]) => [anchor, step],
  ),
);

type NextStepCardProps = {
  jobId: string;
  nextStep: NextStepResult;
  isMobile: boolean;
};

export default function NextStepCard({ jobId, nextStep, isMobile }: NextStepCardProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const primaryCta = nextStep.primaryCta;
  const nextStepStatement = jobDetailsCopy.nextStep.statement;
  const nextStepConfirmation = jobDetailsCopy.nextStep.confirmation;
  const primaryTargetRowId = primaryCta?.actionTarget
    ? PROGRESS_ANCHOR_TO_STEP_MAP.get(primaryCta.actionTarget) ?? null
    : null;
  const primaryAnchorId = primaryCta?.actionTarget ?? null;

  const logPrimaryCtaClick = useCallback(
    (
      routedToCallSession: boolean,
      targetRowId: JobProgressStep | null,
      anchorId: string | null,
    ) => {
      console.log("[job-details-next-step-primary-cta-click]", {
        stepType: nextStep.stepType,
        jobId,
        targetRowId,
        anchorId,
        routedToCallSession,
        isMobile,
      });
    },
    [isMobile, jobId, nextStep.stepType],
  );

  const dispatchProgressEvent = useCallback((stepId: JobProgressStep) => {
    if (typeof window === "undefined") {
      return;
    }
    window.dispatchEvent(
      new CustomEvent(NEXT_STEP_PROGRESS_EVENT, {
        detail: { stepId },
      }),
    );
  }, []);

  const handleCallAction = useCallback(async () => {
    if (!primaryCta) {
      return;
    }
    setIsLoading(true);
    try {
      const result = await openOrCreateCallSessionForJobAction({ jobId });
      if (result.ok) {
        logPrimaryCtaClick(true, primaryTargetRowId, primaryAnchorId);
        router.replace(`/calls/${result.callId}`);
        return;
      }
      logPrimaryCtaClick(false, primaryTargetRowId, primaryAnchorId);
    } catch (error) {
      logPrimaryCtaClick(false, primaryTargetRowId, primaryAnchorId);
      console.error("[job-details-next-step-call-action-error]", { jobId, error });
    } finally {
      setIsLoading(false);
    }
  }, [primaryCta, jobId, logPrimaryCtaClick, router, primaryTargetRowId, primaryAnchorId]);

  const handleProgressCtaClick = useCallback(() => {
    logPrimaryCtaClick(false, primaryTargetRowId, primaryAnchorId);
    if (!primaryTargetRowId) {
      return;
    }
    dispatchProgressEvent(primaryTargetRowId);
  }, [dispatchProgressEvent, logPrimaryCtaClick, primaryTargetRowId, primaryAnchorId]);

  const primaryCtaButton = useMemo(() => {
    if (!primaryCta) {
      return null;
    }
    const isCallAction = primaryCta.actionTarget === "progress-call";
    const isProgressStep = Boolean(primaryTargetRowId);
    if (isCallAction) {
      return (
        <HbButton
          type="button"
          onClick={handleCallAction}
          disabled={isLoading}
          data-testid="job-details-next-step-primary-cta"
          className="w-full md:w-auto"
        >
          {primaryCta.label}
        </HbButton>
      );
    }
    if (isProgressStep) {
      return (
        <HbButton
          type="button"
          onClick={handleProgressCtaClick}
          data-testid="job-details-next-step-primary-cta"
          className="w-full md:w-auto"
        >
          {primaryCta.label}
        </HbButton>
      );
    }

    return (
      <HbButton
        as={Link}
        href={`#${primaryCta.actionTarget}`}
        onClick={() => logPrimaryCtaClick(false, null, primaryAnchorId)}
        data-testid="job-details-next-step-primary-cta"
        className="w-full md:w-auto"
      >
        {primaryCta.label}
      </HbButton>
    );
  }, [
    handleCallAction,
    handleProgressCtaClick,
    isLoading,
    logPrimaryCtaClick,
    primaryAnchorId,
    primaryCta,
    primaryTargetRowId,
  ]);

  return (
    <HbCard className="space-y-4 border-[var(--color-border-strong)] bg-[var(--color-card-elevated)] p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
          {jobDetailsCopy.nextStep.title}
        </p>
        {!primaryCta ? (
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-text-secondary)]">
            {jobDetailsCopy.nextStep.doneLabel}
          </span>
        ) : null}
      </div>
      <div className="space-y-2">
        <p className="text-sm text-[var(--color-text-secondary)]">{nextStepStatement}</p>
        <p
          data-testid="job-details-next-step-rationale"
          className="text-lg font-semibold text-[var(--color-text-primary)]"
        >
          {nextStep.rationale}
        </p>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {primaryCta ? nextStepConfirmation : jobDetailsCopy.nextStep.doneLabel}
        </p>
      </div>
      {primaryCtaButton ? (
        <div className="flex w-full">{primaryCtaButton}</div>
      ) : null}
    </HbCard>
  );
}
