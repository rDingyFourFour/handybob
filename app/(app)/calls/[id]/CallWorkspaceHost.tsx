"use client";

import { useEffect, type ReactNode } from "react";

import HbCard from "@/components/ui/hb-card";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";
import type { CallSessionMode, CallWorkspacePanel } from "./callSessionTypes";

type CallWorkspaceHostProps = {
  mode: CallSessionMode | null;
  workspaceId: string;
  callId: string;
  jobId: string | null;
  customerId: string | null;
  automatedEligible: boolean;
  manualEligible: boolean;
  automatedPanels: CallWorkspacePanel[];
  manualPanels: CallWorkspacePanel[];
  automatedDisabledReason?: "missing_phone" | "missing_script" | null;
  manualDisabledReason?: "missing_phone" | null;
  manualFallbackNode: ReactNode;
};

export default function CallWorkspaceHost({
  mode,
  workspaceId,
  callId,
  jobId,
  customerId,
  automatedEligible,
  manualEligible,
  automatedPanels,
  manualPanels,
  automatedDisabledReason,
  manualDisabledReason,
  manualFallbackNode,
}: CallWorkspaceHostProps) {
  useEffect(() => {
    console.log("[calls-session-workspace-visible]", {
      callId,
      workspaceId,
      jobId,
      customerId,
      selectedMode: mode ?? "locked",
    });
  }, [callId, customerId, jobId, mode, workspaceId]);

  if (mode === "automated") {
    return (
      <AutomatedCallWorkspaceCard
        panels={automatedPanels}
        fallback={manualFallbackNode}
        disabledReason={automatedDisabledReason}
        eligible={automatedEligible}
      />
    );
  }
  if (mode === "manual") {
    return (
      <ManualGuidedCallWorkspaceCard
        panels={manualPanels}
        disabledReason={manualDisabledReason}
        eligible={manualEligible}
      />
    );
  }
  return <LockedWorkspaceCard automatedEligible={automatedEligible} manualEligible={manualEligible} />;
}

type LockedWorkspaceCardProps = {
  automatedEligible: boolean;
  manualEligible: boolean;
};

function LockedWorkspaceCard({ automatedEligible, manualEligible }: LockedWorkspaceCardProps) {
  return (
    <HbCard id="call-workspace" data-testid="call-workspace-locked" className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {callSessionCopy.workspace.title}
        </p>
        <h2 className="hb-heading-3 text-xl font-semibold text-white">
          {callSessionCopy.workspace.title}
        </h2>
        <p className="text-sm text-slate-400">{callSessionCopy.workspace.helper}</p>
      </div>
      <div className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-200">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {callSessionCopy.workspace.availabilityTitle}
        </p>
        <div className="space-y-1 text-xs text-slate-400">
          <div className="flex items-center justify-between">
            <span>{callSessionCopy.workspace.automatedLabel}</span>
            <span className={automatedEligible ? "text-emerald-300" : "text-slate-500"}>
              {automatedEligible
                ? callSessionCopy.workspace.ready
                : callSessionCopy.workspace.missingAutomated}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>{callSessionCopy.workspace.manualLabel}</span>
            <span className={manualEligible ? "text-emerald-300" : "text-slate-500"}>
              {manualEligible ? callSessionCopy.workspace.ready : callSessionCopy.workspace.missingManual}
            </span>
          </div>
        </div>
      </div>
    </HbCard>
  );
}

type AutomatedCallWorkspaceCardProps = {
  panels: CallWorkspacePanel[];
  fallback: ReactNode;
  disabledReason?: "missing_phone" | "missing_script" | null;
  eligible: boolean;
};

function AutomatedCallWorkspaceCard({
  panels,
  fallback,
  disabledReason,
  eligible,
}: AutomatedCallWorkspaceCardProps) {
  return (
    <HbCard id="call-workspace" data-testid="call-workspace-automated" className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {callSessionCopy.workspace.automatedModeLabel}
        </p>
        <h2 className="hb-heading-3 text-xl font-semibold text-white">
          {callSessionCopy.workspace.automatedTitle}
        </h2>
        <p className="text-sm text-slate-400">{callSessionCopy.workspace.automatedHelper}</p>
        {!eligible && disabledReason && (
          <p className="text-xs text-amber-300">
            {disabledReason === "missing_phone"
              ? callSessionCopy.disabled.missingPhone
              : callSessionCopy.disabled.missingScript}
          </p>
        )}
      </div>
      <div className="space-y-4">
        {panels.map((panel) => (
          <div key={panel.id}>{panel.node}</div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-200">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Manual escape hatches</p>
        <p className="text-sm text-slate-400">
          Use these only if you need to call manually. Automated AskBob remains the primary path.
        </p>
        <div className="mt-3">{fallback}</div>
      </div>
    </HbCard>
  );
}

type ManualGuidedCallWorkspaceCardProps = {
  panels: CallWorkspacePanel[];
  disabledReason?: "missing_phone" | null;
  eligible: boolean;
};

function ManualGuidedCallWorkspaceCard({
  panels,
  disabledReason,
  eligible,
}: ManualGuidedCallWorkspaceCardProps) {
  return (
    <HbCard id="call-workspace" data-testid="call-workspace-manual" className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {callSessionCopy.workspace.manualModeLabel}
        </p>
        <h2 className="hb-heading-3 text-xl font-semibold text-white">
          {callSessionCopy.workspace.manualTitle}
        </h2>
        <p className="text-sm text-slate-400">{callSessionCopy.workspace.manualHelper}</p>
        {!eligible && disabledReason === "missing_phone" && (
          <p className="text-xs text-amber-300">{callSessionCopy.disabled.missingPhone}</p>
        )}
      </div>
      <div className="space-y-4">{panels.map((panel) => (
        <div key={panel.id}>{panel.node}</div>
      ))}</div>
    </HbCard>
  );
}
