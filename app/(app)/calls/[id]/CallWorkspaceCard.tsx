"use client";

import { useCallback, useEffect, type ReactNode } from "react";

import HbCard from "@/components/ui/hb-card";
import { type CallSessionMode } from "@/components/calls/CallModeChooserCard";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";

type CallWorkspaceCardProps = {
  callId: string;
  workspaceId: string;
  jobId: string | null;
  customerId: string | null;
  selectedMode: CallSessionMode | null;
  automatedEligible: boolean;
  manualEligible: boolean;
  automatedPanel: ReactNode;
  manualPanel: ReactNode;
};

const WORKSPACE_NAV_EVENT = "calls-session-workspace-navigate";

function scrollToHash(hash: string | null) {
  if (!hash || typeof window === "undefined") {
    return;
  }
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  const target = document.getElementById(normalized);
  if (!target) {
    return;
  }
  if (typeof target.scrollIntoView !== "function") {
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function CallWorkspaceCard({
  callId,
  workspaceId,
  jobId,
  customerId,
  selectedMode,
  automatedEligible,
  manualEligible,
  automatedPanel,
  manualPanel,
}: CallWorkspaceCardProps) {
  const handleWorkspaceNavigate = useCallback((hash: string | null) => {
    if (!hash) {
      return;
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        scrollToHash(hash);
      });
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ hash?: string }>).detail;
      handleWorkspaceNavigate(detail?.hash ?? null);
    };
    const handleHashChange = () => {
      handleWorkspaceNavigate(window.location.hash || null);
    };
    window.addEventListener(WORKSPACE_NAV_EVENT, handleNavigate);
    window.addEventListener("hashchange", handleHashChange);
    if (window.location.hash) {
      window.requestAnimationFrame(() => {
        handleWorkspaceNavigate(window.location.hash);
      });
    }
    return () => {
      window.removeEventListener(WORKSPACE_NAV_EVENT, handleNavigate);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [handleWorkspaceNavigate]);

  const panelKey = selectedMode ?? "unselected";

  useEffect(() => {
    console.log("[calls-session-workspace-visible]", {
      callId,
      workspaceId,
      jobId,
      customerId,
      selectedMode: panelKey,
      panel: panelKey,
    });
  }, [callId, customerId, jobId, panelKey, workspaceId]);

  return (
    <HbCard id="call-workspace" data-testid="call-workspace-card" className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {callSessionCopy.workspace.title}
        </p>
        <h2 className="hb-heading-3 text-xl font-semibold text-white">
          {callSessionCopy.workspace.title}
        </h2>
        <p className="text-sm text-slate-400">{callSessionCopy.workspace.helper}</p>
      </div>

      {panelKey === "unselected" && (
        <div data-testid="call-workspace-panel-unselected" className="space-y-4">
          <div className="space-y-2 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-200">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              {callSessionCopy.workspace.availabilityTitle}
            </p>
            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-200">{callSessionCopy.workspace.automatedLabel}</span>
                <span className={automatedEligible ? "text-emerald-300" : "text-slate-500"}>
                  {automatedEligible
                    ? callSessionCopy.workspace.ready
                    : callSessionCopy.workspace.missingAutomated}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-200">{callSessionCopy.workspace.manualLabel}</span>
                <span className={manualEligible ? "text-emerald-300" : "text-slate-500"}>
                  {manualEligible
                    ? callSessionCopy.workspace.ready
                    : callSessionCopy.workspace.missingManual}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {panelKey === "automated" && (
        <div data-testid="call-workspace-panel-automated" className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              {callSessionCopy.workspace.automatedModeLabel}
            </p>
            <h3 className="text-lg font-semibold text-white">
              {callSessionCopy.workspace.automatedTitle}
            </h3>
            <p className="text-sm text-slate-400">
              {callSessionCopy.workspace.automatedHelper}
            </p>
          </div>
          {automatedPanel}
        </div>
      )}

      {panelKey === "manual" && (
        <div data-testid="call-workspace-panel-manual" className="space-y-4">
          <div className="space-y-1" id="manual-call-tools">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              {callSessionCopy.workspace.manualModeLabel}
            </p>
            <h3 className="text-lg font-semibold text-white">
              {callSessionCopy.workspace.manualTitle}
            </h3>
            <p className="text-sm text-slate-400">{callSessionCopy.workspace.manualHelper}</p>
          </div>
          {manualPanel}
        </div>
      )}
    </HbCard>
  );
}
