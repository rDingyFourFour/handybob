"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import Link from "next/link";

import CallModeDecisionCard from "./CallModeDecisionCard";
import CallPrimaryActionBar from "./CallPrimaryActionBar";
import CallReferenceCard from "./CallReferenceCard";
import CallStatusCompactCard from "./CallStatusCompactCard";
import CallWorkspaceHost from "./CallWorkspaceHost";
import WrapUpFlowCard from "./WrapUpFlowCard";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";
import type {
  CallSessionCtaModel,
  CallSessionMode,
  CallWorkspacePanel,
} from "./callSessionTypes";

const SESSION_STORAGE_PREFIX = "calls-session-mode";

function storageKey(callId: string) {
  return `${SESSION_STORAGE_PREFIX}:${callId}`;
}

function resolveMode(value: string | null): CallSessionMode | null {
  if (value === "automated" || value === "manual") {
    return value;
  }
  return null;
}

function scrollToAnchor(hash: string) {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  const target = document.getElementById(normalized);
  if (!target) {
    return;
  }
  if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  window.history.replaceState(null, "", `#${normalized}`);
}

type StatusChip = {
  key: string;
  label: string;
  value: string;
};

type CallSessionExperienceProps = {
  callId: string;
  workspaceId: string;
  jobId: string | null;
  customerId: string | null;
  headerSubtitle: string;
  directionLabel: string;
  isInbound: boolean;
  fromLabel: string;
  toLabel: string;
  createdLabel: string;
  callSummary: string;
  summaryMissing: boolean;
  customerName: string | null;
  jobTitle: string;
  jobStatus: string;
  jobLink?: string;
  quoteLabel: string;
  quoteLink?: string;
  quoteStatus?: string | null;
  openMessagesHref?: string | null;
  mainStatusLabel: string;
  mainStatusValue: string;
  statusBadgeLabel: string;
  statusChips: StatusChip[];
  callStatusDetails: ReactNode;
  automatedModel: CallSessionCtaModel;
  manualModel: CallSessionCtaModel;
  unselectedModel: CallSessionCtaModel;
  automatedPanels: CallWorkspacePanel[];
  manualPanels: CallWorkspacePanel[];
  automatedEligible: boolean;
  manualEligible: boolean;
  automatedDisabledReason?: "missing_phone" | "missing_script" | null;
  manualDisabledReason?: "missing_phone" | null;
  manualFallbackNode: ReactNode;
  showInProgressBanner: boolean;
  showOutcomeRequiredBanner: boolean;
  callOutcomePanel: ReactNode;
  callFollowUpPanel: ReactNode | null;
  callEnrichmentPanel: ReactNode;
};

export default function CallSessionExperience({
  callId,
  workspaceId,
  jobId,
  customerId,
  headerSubtitle,
  directionLabel,
  isInbound,
  fromLabel,
  toLabel,
  createdLabel,
  callSummary,
  summaryMissing,
  customerName,
  jobTitle,
  jobStatus,
  jobLink,
  quoteLabel,
  quoteLink,
  quoteStatus,
  openMessagesHref,
  mainStatusLabel,
  mainStatusValue,
  statusBadgeLabel,
  statusChips,
  callStatusDetails,
  automatedModel,
  manualModel,
  unselectedModel,
  automatedPanels,
  manualPanels,
  automatedEligible,
  manualEligible,
  automatedDisabledReason,
  manualDisabledReason,
  manualFallbackNode,
  showInProgressBanner,
  showOutcomeRequiredBanner,
  callOutcomePanel,
  callFollowUpPanel,
  callEnrichmentPanel,
}: CallSessionExperienceProps) {
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

  const activeModel = useMemo(() => {
    if (mode === "automated") {
      return automatedModel;
    }
    if (mode === "manual") {
      return manualModel;
    }
    return unselectedModel;
  }, [automatedModel, manualModel, mode, unselectedModel]);

  const emitModeTelemetry = useCallback(
    (nextMode: CallSessionMode) => {
      const modeCopy =
        nextMode === "automated" ? callSessionCopy.mode.automated : callSessionCopy.mode.manual;
      const nextModel = nextMode === "automated" ? automatedModel : manualModel;
      console.log("[calls-session-call-mode-select]", {
        callId,
        workspaceId,
        jobId,
        selectedMode: nextMode,
        modeLabel: modeCopy.label,
        modeDescription: modeCopy.description,
        primaryCtaLabel: nextModel.primaryCta.label,
        ctaReasonCode: nextModel.ctaReasonCode,
        primaryCtaExplanation: nextModel.primaryCtaExplanation,
      });
    },
    [automatedModel, callId, jobId, manualModel, workspaceId],
  );

  const handleModeSelect = useCallback(
    (nextMode: CallSessionMode) => {
      setMode(nextMode);
      persistMode(nextMode);
      emitModeTelemetry(nextMode);
    },
    [emitModeTelemetry, persistMode],
  );

  const handleModeChangeRequest = useCallback(() => {
    console.log("[call-session-mode-change-click]", {
      callId,
      workspaceId,
      jobId,
      customerId,
    });
  }, [callId, customerId, jobId, workspaceId]);

  useEffect(() => {
    if (!mode) {
      return;
    }
    scrollToAnchor("#call-workspace");
  }, [mode]);

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
      primaryCtaLabel: activeModel.primaryCta.label,
      primaryCtaExplanation: activeModel.primaryCtaExplanation,
    });
  }, [
    activeModel.ctaReasonCode,
    activeModel.primaryCta.kind,
    activeModel.primaryCta.label,
    activeModel.primaryCtaExplanation,
    callId,
    mode,
    workspaceId,
  ]);

  return (
    <div className="hb-shell pt-20 pb-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-end border-b border-slate-900 pb-5">
          <Link
            href="/calls"
            className="rounded-full border border-slate-800/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-100 hover:border-slate-600"
          >
            {callSessionCopy.header.backToCalls}
          </Link>
        </div>
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            {callSessionCopy.header.title}
          </p>
          <h1 className="hb-heading-1 text-3xl font-semibold text-white">Call session</h1>
          <p className="text-sm text-slate-400">{headerSubtitle}</p>
        </div>

        <CallModeDecisionCard
          mode={mode}
          automatedEligible={automatedEligible}
          manualEligible={manualEligible}
          automatedDisabledReason={automatedDisabledReason}
          manualDisabledReason={manualDisabledReason}
          onSelect={handleModeSelect}
          onRequestChange={handleModeChangeRequest}
        />

        <CallStatusCompactCard
          directionLabel={directionLabel}
          isInbound={isInbound}
          fromLabel={fromLabel}
          toLabel={toLabel}
          createdAtLabel={createdLabel}
          mainStatusLabel={mainStatusLabel}
          mainStatusValue={mainStatusValue}
          statusBadgeLabel={statusBadgeLabel}
          statuses={statusChips}
          details={callStatusDetails}
        />

        <CallPrimaryActionBar model={activeModel} />

        <CallWorkspaceHost
          mode={mode}
          workspaceId={workspaceId}
          callId={callId}
          jobId={jobId}
          customerId={customerId}
          automatedEligible={automatedEligible}
          manualEligible={manualEligible}
          automatedPanels={automatedPanels}
          manualPanels={manualPanels}
          automatedDisabledReason={automatedDisabledReason}
          manualDisabledReason={manualDisabledReason}
          manualFallbackNode={manualFallbackNode}
        />

        <WrapUpFlowCard
          customerName={customerName}
          callFromLabel={fromLabel}
          callToLabel={toLabel}
          createdAtLabel={createdLabel}
          callSummary={callSummary}
          summaryMissing={summaryMissing}
          jobTitle={jobTitle}
          jobStatus={jobStatus}
          jobLink={jobLink}
          callId={callId}
          showInProgressBanner={showInProgressBanner}
          showOutcomeRequiredBanner={showOutcomeRequiredBanner}
          outcomePanel={callOutcomePanel}
          followUpPanel={callFollowUpPanel}
          enrichmentPanel={callEnrichmentPanel}
        />

        <CallReferenceCard
          jobTitle={jobTitle}
          jobStatus={jobStatus}
          jobLink={jobLink}
          quoteLabel={quoteLabel}
          quoteStatus={quoteStatus}
          quoteLink={quoteLink}
          openMessagesHref={openMessagesHref}
          jobHref={jobLink}
        />
      </div>
    </div>
  );
}
