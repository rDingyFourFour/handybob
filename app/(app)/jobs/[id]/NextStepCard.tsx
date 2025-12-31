"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import { openOrCreateCallSessionForJobAction } from "@/app/(app)/jobs/actions/openOrCreateCallSessionForJobAction";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import type { BobInstruction } from "@/lib/domain/bob/bobInstruction";

const NEXT_STEP_PROGRESS_EVENT = "job-details-next-step-progress";

type NextStepCardProps = {
  jobId: string;
  instruction: BobInstruction;
  isMobile: boolean;
};

export default function NextStepCard({ jobId, instruction, isMobile }: NextStepCardProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const primaryCta = instruction.primaryCta;
  const primaryTargetRowId = primaryCta?.targetStepId ?? null;

  const logPrimaryCtaClick = useCallback(
    (routedToCallSession: boolean) => {
      console.log("[job-details-next-step-primary-cta-click]", {
        instructionStepType: instruction.stepType,
        instructionTelemetry: instruction.telemetry,
        actionType: primaryCta?.actionType ?? null,
        targetStepId: primaryCta?.targetStepId ?? null,
        href: primaryCta?.href ?? null,
        hasPrimaryCta: Boolean(primaryCta && !primaryCta.disabled),
        hasTargetStepId: Boolean(primaryCta?.targetStepId),
        hasHref: Boolean(primaryCta?.href),
        routedToCallSession,
        jobId,
        isMobile,
      });
    },
    [instruction, primaryCta, jobId, isMobile],
  );

  const dispatchProgressEvent = useCallback((stepId: string) => {
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
        logPrimaryCtaClick(true);
        router.replace(`/calls/${result.callId}`);
        return;
      }
      logPrimaryCtaClick(false);
    } catch (error) {
      logPrimaryCtaClick(false);
      console.error("[job-details-next-step-call-action-error]", { jobId, error });
    } finally {
      setIsLoading(false);
    }
  }, [jobId, logPrimaryCtaClick, router, primaryCta]);

  const handleProgressCtaClick = useCallback(() => {
    logPrimaryCtaClick(false);
    if (!primaryTargetRowId) {
      return;
    }
    dispatchProgressEvent(primaryTargetRowId);
  }, [dispatchProgressEvent, logPrimaryCtaClick, primaryTargetRowId]);

  const primaryCtaButton = useMemo(() => {
    if (!primaryCta) {
      return null;
    }
    const isCallAction = primaryCta.actionType === "call";
    const isProgressStep = primaryCta.actionType === "progress-step";
    if (isCallAction) {
      return (
        <HbButton
          type="button"
          onClick={handleCallAction}
          disabled={isLoading || Boolean(primaryCta.disabled)}
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
        href={primaryCta.href ?? "#"}
        onClick={() => logPrimaryCtaClick(false)}
        data-testid="job-details-next-step-primary-cta"
        className="w-full md:w-auto"
      >
        {primaryCta.label}
      </HbButton>
    );
  }, [handleCallAction, handleProgressCtaClick, isLoading, logPrimaryCtaClick, primaryCta]);

  return (
    <HbCard
      className="space-y-4 border-[var(--color-border-strong)] bg-[var(--color-card-elevated)] p-5"
      data-instruction-step-type={instruction.stepType}
      data-instruction-has-primary-cta={primaryCta ? "true" : "false"}
    >
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
        <p className="text-sm text-[var(--color-text-secondary)]">{instruction.statement}</p>
        <p
          data-testid="job-details-next-step-rationale"
          className="text-lg font-semibold text-[var(--color-text-primary)]"
        >
          {instruction.recommendation}
        </p>
        {instruction.rationale ? (
          <p className="text-sm text-[var(--color-text-secondary)]">{instruction.rationale}</p>
        ) : null}
        {!primaryCta ? (
          <p className="text-sm text-[var(--color-text-secondary)]">{jobDetailsCopy.nextStep.doneLabel}</p>
        ) : null}
      </div>
      {primaryCtaButton ? <div className="flex w-full">{primaryCtaButton}</div> : null}
    </HbCard>
  );
}
