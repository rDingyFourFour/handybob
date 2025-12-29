"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import { openOrCreateCallSessionForJobAction } from "@/app/(app)/jobs/actions/openOrCreateCallSessionForJobAction";
import { jobDetailsCopy } from "@/lib/ui/copy/jobDetailsCopy";
import type { NextStepResult } from "@/lib/domain/askbob/nextStep";

type NextStepCardProps = {
  jobId: string;
  nextStep: NextStepResult;
};

export default function NextStepCard({ jobId, nextStep }: NextStepCardProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const primaryCta = nextStep.primaryCta;

  const logPrimaryCtaClick = useCallback(
    (routedToCallSession: boolean) => {
      console.log("[job-details-next-step-primary-cta-click]", {
        stepType: nextStep.stepType,
        jobId,
        routedToCallSession,
      });
    },
    [jobId, nextStep.stepType],
  );

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
  }, [primaryCta, jobId, logPrimaryCtaClick, router]);

  const primaryCtaButton = useMemo(() => {
    if (!primaryCta) {
      return null;
    }
    const isCallAction = primaryCta.actionTarget === "call-session";
    if (isCallAction) {
      return (
        <HbButton
          type="button"
          onClick={handleCallAction}
          disabled={isLoading}
          data-testid="job-details-next-step-primary-cta"
        >
          {primaryCta.label}
        </HbButton>
      );
    }

    return (
      <HbButton
        as={Link}
        href={`#${primaryCta.actionTarget}`}
        onClick={() => logPrimaryCtaClick(false)}
        data-testid="job-details-next-step-primary-cta"
      >
        {primaryCta.label}
      </HbButton>
    );
  }, [handleCallAction, isLoading, logPrimaryCtaClick, primaryCta]);

  return (
    <HbCard className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{jobDetailsCopy.nextStep.title}</p>
        {!primaryCta ? (
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            {jobDetailsCopy.nextStep.doneLabel}
          </span>
        ) : null}
      </div>
      <p className="text-sm text-slate-200">{nextStep.rationale}</p>
      {primaryCtaButton}
    </HbCard>
  );
}
