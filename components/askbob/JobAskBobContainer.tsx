"use client";

import { useEffect, useState } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import JobAskBobHud from "@/components/askbob/JobAskBobHud";

type StageStatus = "not_started" | "drafted" | "completed";

type StageStatusItem = {
  id: string;
  label: string;
  status: StageStatus;
  order: number;
};

type JobAskBobContainerProps = {
  workspaceId: string;
  jobId: string;
  hudActivityLine: string;
  hudActivityTitle?: string | null;
  hudScopeHint?: string | null;
  stageStatusItems: StageStatusItem[];
  nextActionLabel: string;
  nextActionMessage: string;
  nextActionRationale?: string | null;
  nextActionErrorMessage?: string | null;
  nextActionDisabled?: boolean;
  onNextAction?: () => void;
  onStageSelect?: (stageId: string) => void;
  showCallPrepAction?: boolean;
  onShowCallPrep?: () => void;
};

export default function JobAskBobContainer({
  workspaceId,
  jobId,
  hudActivityLine,
  hudActivityTitle,
  hudScopeHint,
  stageStatusItems,
  nextActionLabel,
  nextActionMessage,
  nextActionRationale,
  nextActionErrorMessage,
  nextActionDisabled = false,
  onNextAction,
  onStageSelect,
  showCallPrepAction = false,
  onShowCallPrep,
}: JobAskBobContainerProps) {
  const [showStages, setShowStages] = useState(false);
  const sortedStageStatusItems = [...stageStatusItems].sort((a, b) => a.order - b.order);
  const statusLabels: Record<StageStatus, string> = {
    not_started: "Not started",
    drafted: "Drafted",
    completed: "Completed",
  };
  useEffect(() => {
    console.log("[askbob-job-assistant-visible]", {
      workspaceId,
      jobId,
      stageCount: stageStatusItems.length,
    });
  }, [jobId, stageStatusItems.length, workspaceId]);

  return (
    <HbCard className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob Job Assistant</p>
        <h2 className="hb-heading-3 text-xl font-semibold">AskBob job assistant for this job</h2>
        <p className="text-sm text-slate-300">
          AskBob reviews this job’s title and description to help you diagnose issues, list materials, draft quotes, and plan follow-ups. Treat every suggestion as approximate and review the details before sharing them with a customer.
        </p>
        <JobAskBobHud
          activityLine={hudActivityLine}
          activityLineTitle={hudActivityTitle}
          scopeHint={hudScopeHint}
        />
      </div>
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">What’s next</p>
          <p className="text-sm text-slate-200">{nextActionMessage}</p>
          {nextActionRationale && (
            <p className="text-xs text-slate-400">{nextActionRationale}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HbButton
            type="button"
            size="sm"
            variant="secondary"
            className="px-3"
            onClick={onNextAction}
            disabled={nextActionDisabled}
          >
            {nextActionLabel}
          </HbButton>
          <HbButton
            type="button"
            size="sm"
            variant="ghost"
            className="px-2 py-0.5 text-[11px] tracking-[0.3em]"
            onClick={() => setShowStages((value) => !value)}
          >
            {showStages ? "Hide stages" : "See all"}
          </HbButton>
          {showCallPrepAction && (
            <HbButton
              type="button"
              size="sm"
              variant="ghost"
              className="px-2 py-0.5 text-[11px] tracking-[0.3em]"
              onClick={onShowCallPrep}
            >
              Show call prep
            </HbButton>
          )}
        </div>
        {nextActionErrorMessage && (
          <p className="text-xs text-rose-400">{nextActionErrorMessage}</p>
        )}
        {showStages && (
          <div className="grid gap-2 text-xs text-slate-300 md:grid-cols-2">
            {sortedStageStatusItems.map((stage) => (
              <button
                key={stage.id}
                type="button"
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-left text-xs text-slate-200 transition hover:border-slate-600"
                onClick={() => onStageSelect?.(stage.id)}
              >
                <span className="text-slate-200">{stage.label}</span>
                <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                  {statusLabels[stage.status]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        className="space-y-1 rounded-2xl border border-slate-800/70 bg-slate-950/30 px-4 py-2 text-[11px] text-slate-400"
        data-testid="askbob-stage-status-compact"
      >
        {sortedStageStatusItems.map((stage) => (
          <div key={stage.id} className="flex items-center justify-between">
            <span className="text-slate-200">{stage.label}</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">
              {statusLabels[stage.status]}
            </span>
          </div>
        ))}
      </div>
    </HbCard>
  );
}
