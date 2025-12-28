"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import CallModeChooserCard, { type CallSessionMode } from "@/components/calls/CallModeChooserCard";
import CallControlCard from "./CallControlCard";
import GuidedCallWorkspaceCard from "./GuidedCallWorkspaceCard";

type CallSessionHubProps = {
  callId: string;
  workspaceId: string;
  jobId: string | null;
  automatedModel: Parameters<typeof CallControlCard>[0]["model"];
  manualModel: Parameters<typeof CallControlCard>[0]["model"];
  unselectedModel: Parameters<typeof CallControlCard>[0]["model"];
  details?: ReactNode;
  prepare: ReactNode;
  during: ReactNode;
  after: ReactNode;
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

function defaultTabForMode(mode: CallSessionMode) {
  return mode === "manual" ? "during" : "prepare";
}

export default function CallSessionHub({
  callId,
  workspaceId,
  jobId,
  automatedModel,
  manualModel,
  unselectedModel,
  details,
  prepare,
  during,
  after,
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
    (eventName: string, nextMode: CallSessionMode) => {
      console.log(eventName, {
        callId,
        workspaceId,
        jobId,
        mode: nextMode,
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

  const dispatchWorkspaceTab = useCallback((nextMode: CallSessionMode) => {
    if (typeof window === "undefined") {
      return;
    }
    window.dispatchEvent(
      new CustomEvent(WORKSPACE_NAV_EVENT, {
        detail: { tab: defaultTabForMode(nextMode) },
      }),
    );
  }, []);

  const handleModeSelect = useCallback(
    (nextMode: CallSessionMode) => {
      const isChange = mode !== null && mode !== nextMode;
      const eventName = isChange
        ? "[calls-session-call-mode-change]"
        : "[calls-session-call-mode-select]";
      setMode(nextMode);
      persistMode(nextMode);
      emitModeTelemetry(eventName, nextMode);
    },
    [emitModeTelemetry, mode, persistMode],
  );

  useEffect(() => {
    if (!mode) {
      return;
    }
    dispatchWorkspaceTab(mode);
  }, [dispatchWorkspaceTab, mode]);

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
      <CallControlCard model={activeModel} modeChooser={modeChooser} details={details} />
      <GuidedCallWorkspaceCard prepare={prepare} during={during} after={after} />
    </div>
  );
}
