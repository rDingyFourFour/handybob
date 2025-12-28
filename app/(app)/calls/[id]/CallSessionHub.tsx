"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import CallModeChooserCard, { type CallSessionMode } from "@/components/calls/CallModeChooserCard";
import CallControlCard from "./CallControlCard";
import CallWorkspaceCard from "./CallWorkspaceCard";

type CallSessionHubProps = {
  callId: string;
  workspaceId: string;
  jobId: string | null;
  customerId: string | null;
  automatedModel: Parameters<typeof CallControlCard>[0]["model"];
  manualModel: Parameters<typeof CallControlCard>[0]["model"];
  unselectedModel: Parameters<typeof CallControlCard>[0]["model"];
  details?: ReactNode;
  automatedWorkspace: ReactNode;
  manualWorkspace: ReactNode;
  automatedEligible: boolean;
  manualEligible: boolean;
};

const SESSION_STORAGE_PREFIX = "calls-session-mode";
const WORKSPACE_NAV_EVENT = "calls-session-workspace-navigate";

function storageKey(callId: string) {
  return `${SESSION_STORAGE_PREFIX}:${callId}`;
}

function resolveMode(value: string | null): CallSessionMode | null {
  if (value === "automated" || value === "manual") {
    return value;
  }
  return null;
}

export default function CallSessionHub({
  callId,
  workspaceId,
  jobId,
  customerId,
  automatedModel,
  manualModel,
  unselectedModel,
  details,
  automatedWorkspace,
  manualWorkspace,
  automatedEligible,
  manualEligible,
}: CallSessionHubProps) {
  const [mode, setMode] = useState<CallSessionMode | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      const stored = window.sessionStorage.getItem(storageKey(callId));
      return resolveMode(stored);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      console.warn("[calls-session-call-mode-storage-read-failed]", {
        callId,
        reason,
      });
      return null;
    }
  });

  const emitModeTelemetry = useCallback(
    (nextMode: CallSessionMode) => {
      console.log("[calls-session-call-mode-select]", {
        callId,
        workspaceId,
        jobId,
        selectedMode: nextMode,
      });
    },
    [callId, jobId, workspaceId],
  );

  const persistMode = useCallback(
    (nextMode: CallSessionMode) => {
      try {
        window.sessionStorage.setItem(storageKey(callId), nextMode);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "unknown";
        console.warn("[calls-session-call-mode-storage-write-failed]", {
          callId,
          reason,
        });
      }
    },
    [callId],
  );

  const dispatchWorkspaceNavigate = useCallback((hash: string) => {
    if (typeof window === "undefined") {
      return;
    }
    window.dispatchEvent(
      new CustomEvent(WORKSPACE_NAV_EVENT, {
        detail: { hash },
      }),
    );
  }, []);

  const handleModeSelect = useCallback(
    (nextMode: CallSessionMode) => {
      setMode(nextMode);
      persistMode(nextMode);
      emitModeTelemetry(nextMode);
    },
    [emitModeTelemetry, persistMode],
  );

  useEffect(() => {
    if (!mode) {
      return;
    }
    dispatchWorkspaceNavigate("#call-workspace");
  }, [dispatchWorkspaceNavigate, mode]);

  const activeModel = useMemo(() => {
    if (mode === "automated") {
      return automatedModel;
    }
    if (mode === "manual") {
      return manualModel;
    }
    return unselectedModel;
  }, [automatedModel, manualModel, mode, unselectedModel]);

  useEffect(() => {
    if (!mode) {
      return;
    }
    console.log("[calls-session-primary-cta-visible]", {
      workspaceId,
      callId,
      callMode: mode,
      ctaKind: activeModel.primaryCta.kind,
      ctaReasonCode: activeModel.ctaReasonCode,
    });
  }, [activeModel.ctaReasonCode, activeModel.primaryCta.kind, callId, mode, workspaceId]);

  const modeChooser = (
    <CallModeChooserCard mode={mode} onSelect={handleModeSelect} />
  );

  return (
    <div className="space-y-6">
      <CallControlCard model={activeModel} details={details} modeChooser={modeChooser} />
      <CallWorkspaceCard
        callId={callId}
        workspaceId={workspaceId}
        jobId={jobId}
        customerId={customerId}
        selectedMode={mode}
        automatedEligible={automatedEligible}
        manualEligible={manualEligible}
        automatedPanel={automatedWorkspace}
        manualPanel={manualWorkspace}
      />
    </div>
  );
}
