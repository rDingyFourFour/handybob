"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import AskBobSection from "@/components/askbob/AskBobSection";
import AskBobMaterialsPanel, { type MaterialsSummaryContext } from "@/components/askbob/AskBobMaterialsPanel";
import AskBobQuotePanel from "@/components/askbob/AskBobQuotePanel";
import AskBobSchedulerPanel from "@/components/askbob/AskBobSchedulerPanel";
import AskBobCallAssistPanel, {
  type StartCallWithScriptPayload,
} from "@/components/askbob/AskBobCallAssistPanel";
import JobAskBobFollowupPanel from "@/components/askbob/JobAskBobFollowupPanel";
import JobAskBobPanel, { type JobDiagnosisContext } from "@/components/askbob/JobAskBobPanel";
import JobAskBobAfterCallPanel from "@/components/askbob/JobAskBobAfterCallPanel";
import JobAskBobContainer from "@/components/askbob/JobAskBobContainer";
import { formatFriendlyDateTime } from "@/utils/timeline/formatters";
import {
  adaptAskBobMaterialsToSmartQuote,
  summarizeMaterialsSuggestion,
} from "@/lib/domain/quotes/materials-askbob-adapter";
import type {
  AskBobAfterCallSnapshotPayload,
  AskBobDiagnoseSnapshotPayload,
  AskBobFollowupSnapshotPayload,
  AskBobJobFollowupResult,
  AskBobMaterialsSnapshotPayload,
  AskBobQuoteSnapshotPayload,
} from "@/lib/domain/askbob/types";
import {
  buildDiagnosisSummary,
  buildFollowupSummaryFromSnapshot,
  buildQuoteSummaryFromSnapshot,
} from "@/lib/domain/askbob/summary";

const MAX_SCRIPT_QUERY_LENGTH = 4000;

export function buildAskBobCallAssistUrl(params: {
  jobId: string;
  customerId?: string | null;
  origin: string;
  scriptBody: string;
  scriptSummary?: string | null;
}) {
  const { jobId, customerId, origin, scriptBody, scriptSummary } = params;
  const scriptValue = scriptBody.trim().slice(0, MAX_SCRIPT_QUERY_LENGTH);
  const query = new URLSearchParams();
  query.set("jobId", jobId);
  if (customerId) {
    query.set("customerId", customerId);
  }
  query.set("origin", origin);
  if (scriptValue) {
    query.set("scriptBody", scriptValue);
  }
  if (scriptSummary) {
    query.set("scriptSummary", scriptSummary);
  }
  return `/calls/new?${query.toString()}`;
}

type JobAskBobFlowProps = {
  workspaceId: string;
  jobId: string;
  userId: string;
  customerId?: string | null;
  customerDisplayName?: string | null;
  customerPhoneNumber?: string | null;
  jobDescription?: string | null;
  jobTitle?: string | null;
  askBobLastTaskLabel?: string | null;
  askBobLastUsedAtDisplay?: string | null;
  askBobLastUsedAtIso?: string | null;
  askBobRunsSummary?: string | null;
  initialLastQuoteId?: string | null;
  lastQuoteCreatedAt?: string | null;
  lastQuoteCreatedAtFriendly?: string | null;
  initialDiagnoseSnapshot?: AskBobDiagnoseSnapshotPayload | null;
  initialMaterialsSnapshot?: AskBobMaterialsSnapshotPayload | null;
  initialQuoteSnapshot?: AskBobQuoteSnapshotPayload | null;
  initialFollowupSnapshot?: AskBobFollowupSnapshotPayload | null;
  initialAfterCallSnapshot?: AskBobAfterCallSnapshotPayload | null;
  lastQuoteSummary?: string | null;
  latestCallLabel?: string | null;
  hasLatestCall?: boolean;
};

type SessionQuote = {
  quoteId: string;
  createdAtIso: string | null;
  friendlyLabel: string | null;
};

export default function JobAskBobFlow({
  workspaceId,
  jobId,
  userId,
  customerId,
  customerDisplayName,
  customerPhoneNumber,
  jobDescription,
  jobTitle,
  askBobLastTaskLabel,
  askBobLastUsedAtDisplay,
  askBobLastUsedAtIso,
  askBobRunsSummary,
  initialLastQuoteId,
  lastQuoteCreatedAt,
  lastQuoteCreatedAtFriendly,
  initialDiagnoseSnapshot,
  initialMaterialsSnapshot,
  initialQuoteSnapshot,
  initialFollowupSnapshot,
  initialAfterCallSnapshot,
  lastQuoteSummary,
  latestCallLabel,
  hasLatestCall,
}: JobAskBobFlowProps) {
  const diagnosisSummaryInitialValue = initialDiagnoseSnapshot
    ? buildDiagnosisSummary(initialDiagnoseSnapshot.response)
    : null;
  const materialsSuggestionInitialValue = initialMaterialsSnapshot
    ? adaptAskBobMaterialsToSmartQuote({
        items: initialMaterialsSnapshot.items,
        notes: initialMaterialsSnapshot.notes ?? null,
        modelLatencyMs: 0,
        rawModelOutput: null,
      })
    : null;
  const materialsSummaryInitialValue = materialsSuggestionInitialValue
    ? summarizeMaterialsSuggestion(materialsSuggestionInitialValue)
    : null;

  const [diagnosisSummary, setDiagnosisSummary] = useState<string | null>(
    diagnosisSummaryInitialValue,
  );
  const [diagnosisDone, setDiagnosisDone] = useState(false);
  const [materialsSummary, setMaterialsSummary] = useState<string | null>(
    materialsSummaryInitialValue ?? null,
  );
  const [materialsDone, setMaterialsDone] = useState(false);
  const [sessionQuote, setSessionQuote] = useState<SessionQuote | null>(null);
  const followupSummaryInitialValue = buildFollowupSummaryFromSnapshot(initialFollowupSnapshot);
  const quoteSummaryInitialValue = buildQuoteSummaryFromSnapshot(initialQuoteSnapshot ?? null);

  const [followupSummary, setFollowupSummary] = useState<string | null>(followupSummaryInitialValue);
  const [quoteSummary, setQuoteSummary] = useState<string | null>(quoteSummaryInitialValue);
  const [followupCallRecommended, setFollowupCallRecommended] = useState(
    Boolean(initialFollowupSnapshot?.callRecommended),
  );
  const [followupCallPurpose, setFollowupCallPurpose] = useState(
    initialFollowupSnapshot?.callPurpose ?? null,
  );
  const [followupCallTone, setFollowupCallTone] = useState(
    initialFollowupSnapshot?.callTone ?? null,
  );
  const [callScriptSummary, setCallScriptSummary] = useState<string | null>(null);
  const [diagnoseCollapsed, setDiagnoseCollapsed] = useState(false);
  const [materialsCollapsed, setMaterialsCollapsed] = useState(false);
  const [quoteCollapsed, setQuoteCollapsed] = useState(false);
  const [followupCollapsed, setFollowupCollapsed] = useState(false);
  const [hasAutoCollapsedAllSteps, setHasAutoCollapsedAllSteps] = useState(false);
  const [followupDone, setFollowupDone] = useState(false);
  const [materialsResetToken, setMaterialsResetToken] = useState(0);
  const [quoteResetToken, setQuoteResetToken] = useState(0);
  const [followupResetToken, setFollowupResetToken] = useState(0);
  const [sessionAskBobAppointment, setSessionAskBobAppointment] = useState<{
    startAt: string;
    friendlyLabel: string | null;
    appointmentId?: string | null;
  } | null>(null);
  const [schedulerDone, setSchedulerDone] = useState(false);
  const [schedulerCollapsed, setSchedulerCollapsed] = useState(false);
  const [callScriptCollapsed, setCallScriptCollapsed] = useState(false);
  const [schedulerResetToken, setSchedulerResetToken] = useState(0);
  const [afterCallSummary, setAfterCallSummary] = useState<string | null>(
    initialAfterCallSnapshot?.afterCallSummary ?? null,
  );
  const [afterCallCollapsed, setAfterCallCollapsed] = useState(false);
  const [afterCallResetToken, setAfterCallResetToken] = useState(0);

  const serverQuoteCandidate = initialLastQuoteId
    ? {
        quoteId: initialLastQuoteId,
        createdAtIso: lastQuoteCreatedAt ?? null,
        friendlyLabel: lastQuoteCreatedAtFriendly?.trim() ? lastQuoteCreatedAtFriendly : null,
      }
    : null;
  const effectiveLastQuote = sessionQuote ?? serverQuoteCandidate;
  const hasQuoteSnapshotContext = Boolean(initialQuoteSnapshot);
  const combinedHasQuoteContextForFollowup =
    Boolean(effectiveLastQuote?.quoteId) || hasQuoteSnapshotContext;
  const quoteDone = Boolean(sessionQuote);
  const callScriptDone = Boolean(callScriptSummary);
  const afterCallDone = Boolean(afterCallSummary);
  const stepStatusItems = [
    { label: "Step 1 Intake", done: true },
    { label: "Step 2 Diagnose", done: diagnosisDone },
    { label: "Step 3 Materials checklist", done: materialsDone },
    { label: "Step 4 Quote suggestion", done: quoteDone },
    { label: "Step 5 Follow-up guidance", done: followupDone },
    { label: "Step 6 Schedule visit", done: schedulerDone },
    { label: "Step 7 Prepare a phone call with AskBob", done: callScriptDone },
    { label: "Step 8 · After the call summary", done: afterCallDone },
  ];

  const promptSeed = jobDescription ?? "";
  const normalizedJobTitle = jobTitle?.trim() ?? "";
  const router = useRouter();
  const callScriptOrigin = "askbob-call-assist";

  const handleStartCallWithScript = useCallback(
    (payload: StartCallWithScriptPayload) => {
      const resolvedCustomerId = payload.customerId ?? customerId ?? null;
      const scriptValue = payload.scriptBody?.trim() ?? "";
      const url = buildAskBobCallAssistUrl({
        jobId,
        customerId: resolvedCustomerId,
        origin: callScriptOrigin,
        scriptBody: scriptValue,
        scriptSummary: payload.scriptSummary,
      });

      console.log("[askbob-call-assist-call-route]", {
        workspaceId,
        userId,
        jobId,
        customerId: resolvedCustomerId,
        hasScriptBody: Boolean(scriptValue),
        scriptLength: scriptValue.length,
        origin: callScriptOrigin,
      });

      router.push(url);
    },
    [callScriptOrigin, customerId, jobId, router, userId, workspaceId],
  );

  const scrollToSection = (sectionId: string) => {
    if (typeof document === "undefined") {
      return;
    }
    const target = document.getElementById(sectionId);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDiagnoseComplete = (context: JobDiagnosisContext) => {
    const summary = context.diagnosisSummary?.trim() ?? null;
    setDiagnosisSummary(summary);
    setDiagnosisDone(Boolean(summary));
    setMaterialsSummary(null);
    setMaterialsDone(false);
    setSessionQuote(null);
    setFollowupDone(false);
    setMaterialsResetToken((value) => value + 1);
    setQuoteResetToken((value) => value + 1);
    setFollowupResetToken((value) => value + 1);
    handleSchedulerReset();
  };

  const handleMaterialsSummaryChange = (context: MaterialsSummaryContext) => {
    const summary = context.materialsSummary?.trim() ?? null;
    setMaterialsSummary(summary);
    setMaterialsDone(Boolean(summary));
    setSessionQuote(null);
    setFollowupDone(false);
    setQuoteResetToken((value) => value + 1);
    setFollowupResetToken((value) => value + 1);
    if (!summary) {
      setMaterialsResetToken((value) => value + 1);
    }
    handleSchedulerReset();
  };

  const handleAskBobQuoteApplied = (quoteId: string, createdAt?: string | null) => {
    const normalizedCreatedAt = createdAt?.trim() || new Date().toISOString();
    const friendlyDate = formatFriendlyDateTime(normalizedCreatedAt, "");
    const friendlyLabel = friendlyDate?.trim() ? friendlyDate : null;
    setSessionQuote({
      quoteId,
      createdAtIso: normalizedCreatedAt,
      friendlyLabel,
    });
    setFollowupDone(false);
    setFollowupResetToken((value) => value + 1);
    handleSchedulerReset();
    const quoteSummaryText = friendlyLabel ? `Latest quote from ${friendlyLabel}.` : null;
    setQuoteSummary(quoteSummaryText);
  };

  const handleQuoteReset = () => {
    setSessionQuote(null);
    setFollowupDone(false);
    setQuoteResetToken((value) => value + 1);
    setFollowupResetToken((value) => value + 1);
    handleSchedulerReset();
    setQuoteSummary(quoteSummaryInitialValue);
  };

  const handleFollowupCompleted = () => {
    setFollowupDone(true);
    maybeAutoCollapseSteps();
  };

  const handleAfterCallSummaryChange = (summary: string | null) => {
    const normalized = summary?.trim() ?? null;
    setAfterCallSummary(normalized);
    if (normalized) {
      maybeAutoCollapseSteps();
    }
  };

  const handleFollowupResult = useCallback(
    (result: AskBobJobFollowupResult | null) => {
      if (!result) {
        setFollowupCallRecommended(false);
        setFollowupCallPurpose(null);
        setFollowupCallTone(null);
        return;
      }
      setFollowupCallRecommended(Boolean(result.callRecommended));
      setFollowupCallPurpose(result.callPurpose ?? null);
      setFollowupCallTone(result.callTone ?? null);
    },
    [],
  );

  const resetCallScriptState = () => {
    setCallScriptSummary(null);
    setCallScriptCollapsed(false);
  };

  const handleSchedulerReset = () => {
    setSchedulerDone(false);
    setSchedulerCollapsed(false);
    setSessionAskBobAppointment(null);
    setSchedulerResetToken((value) => value + 1);
    resetCallScriptState();
  };

  const maybeAutoCollapseSteps = () => {
  if (
    hasAutoCollapsedAllSteps ||
    !diagnosisDone ||
    !materialsDone ||
    !quoteDone ||
    !followupDone ||
    !schedulerDone ||
    !callScriptDone
    || !afterCallDone
  ) {
    return;
  }
  setDiagnoseCollapsed(true);
  setMaterialsCollapsed(true);
  setQuoteCollapsed(true);
  setFollowupCollapsed(true);
  setSchedulerCollapsed(true);
  setCallScriptCollapsed(true);
  setHasAutoCollapsedAllSteps(true);
  };

  const handleFollowupReset = () => {
    handleFollowupResult(null);
    setFollowupDone(false);
    setFollowupResetToken((value) => value + 1);
    handleSchedulerReset();
  };

  const handleAfterCallReset = () => {
    setAfterCallSummary(null);
    setAfterCallResetToken((value) => value + 1);
    setAfterCallCollapsed(false);
  };

  const handleJumpToCallAssist = () => {
    console.log("[askbob-followup-to-call-assist-flow]", {
      workspaceId,
      userId,
      jobId,
      hasCallRecommendation: followupCallRecommended,
    });
    setCallScriptCollapsed(false);
    scrollToSection("askbob-call-script");
  };

  const handleAskBobAppointmentScheduled = (info: {
    startAt: string;
    friendlyLabel: string | null;
    appointmentId?: string | null;
  }) => {
    setSessionAskBobAppointment(info);
    setSchedulerDone(true);
    maybeAutoCollapseSteps();
  };

  return (
    <div className="space-y-6">
      <JobAskBobContainer
        askBobLastTaskLabel={askBobLastTaskLabel}
        askBobLastUsedAtDisplay={askBobLastUsedAtDisplay}
        askBobLastUsedAtIso={askBobLastUsedAtIso}
        askBobRunsSummary={askBobRunsSummary}
        stepStatusItems={stepStatusItems}
      />
      <div className="space-y-8">
        <AskBobSection id="askbob-diagnose">
          <JobAskBobPanel
            workspaceId={workspaceId}
            jobId={jobId}
            customerId={customerId ?? undefined}
            jobDescription={promptSeed}
            jobTitle={normalizedJobTitle}
            initialDiagnoseSnapshot={initialDiagnoseSnapshot ?? undefined}
            onDiagnoseSuccess={() => scrollToSection("askbob-materials")}
            onDiagnoseComplete={handleDiagnoseComplete}
            stepCompleted={diagnosisDone}
            stepCollapsed={diagnoseCollapsed}
            onToggleStepCollapsed={() => setDiagnoseCollapsed((value) => !value)}
          />
        </AskBobSection>
        <AskBobSection id="askbob-after-call">
          <JobAskBobAfterCallPanel
            workspaceId={workspaceId}
            jobId={jobId}
            jobTitle={normalizedJobTitle}
            jobDescription={jobDescription ?? null}
            latestCallLabel={latestCallLabel ?? null}
            hasCall={Boolean(hasLatestCall ?? latestCallLabel)}
            stepCompleted={afterCallDone}
            resetToken={afterCallResetToken}
            onReset={handleAfterCallReset}
            stepCollapsed={afterCallCollapsed}
            onToggleStepCollapsed={() => setAfterCallCollapsed((value) => !value)}
            initialAfterCallSnapshot={initialAfterCallSnapshot ?? undefined}
            onAfterCallSummaryChange={handleAfterCallSummaryChange}
          />
        </AskBobSection>
        <AskBobSection id="askbob-materials">
          <AskBobMaterialsPanel
            workspaceId={workspaceId}
            jobId={jobId}
            customerId={customerId ?? null}
            onMaterialsSuccess={() => scrollToSection("askbob-quote")}
            diagnosisSummaryForMaterials={diagnosisSummary}
            onMaterialsSummaryChange={handleMaterialsSummaryChange}
            jobDescription={jobDescription ?? null}
            jobTitle={normalizedJobTitle}
            initialMaterialsSnapshot={initialMaterialsSnapshot ?? undefined}
            stepCompleted={materialsDone}
            resetToken={materialsResetToken}
            stepCollapsed={materialsCollapsed}
            onToggleStepCollapsed={() => setMaterialsCollapsed((value) => !value)}
          />
        </AskBobSection>
        <AskBobSection id="askbob-quote">
          <AskBobQuotePanel
            workspaceId={workspaceId}
            jobId={jobId}
            customerId={customerId ?? null}
            onQuoteSuccess={() => scrollToSection("askbob-followup")}
            diagnosisSummaryForQuote={diagnosisSummary}
            materialsSummaryForQuote={materialsSummary}
            jobDescription={jobDescription ?? null}
            jobTitle={normalizedJobTitle}
            onQuoteApplied={handleAskBobQuoteApplied}
            onScrollToFollowup={() => scrollToSection("askbob-followup")}
            stepCompleted={quoteDone}
            resetToken={quoteResetToken}
            onQuoteReset={handleQuoteReset}
            stepCollapsed={quoteCollapsed}
            onToggleStepCollapsed={() => setQuoteCollapsed((value) => !value)}
            initialQuoteSnapshot={initialQuoteSnapshot ?? undefined}
          />
        </AskBobSection>
        <AskBobSection id="askbob-followup">
          <JobAskBobFollowupPanel
            workspaceId={workspaceId}
            jobId={jobId}
            userId={userId}
            customerId={customerId ?? null}
            jobTitle={normalizedJobTitle}
            jobDescription={jobDescription ?? null}
            diagnosisSummaryForFollowup={diagnosisSummary}
            materialsSummaryForFollowup={materialsSummary}
            hasQuoteContextForFollowup={combinedHasQuoteContextForFollowup}
            lastQuoteIdForFollowup={effectiveLastQuote?.quoteId ?? undefined}
            lastQuoteCreatedAtForFollowup={effectiveLastQuote?.createdAtIso ?? undefined}
            lastQuoteCreatedAtLabelForFollowup={effectiveLastQuote?.friendlyLabel ?? undefined}
            stepCompleted={followupDone}
            onFollowupCompleted={handleFollowupCompleted}
            resetToken={followupResetToken}
            onReset={handleFollowupReset}
            stepCollapsed={followupCollapsed}
            onToggleStepCollapsed={() => setFollowupCollapsed((value) => !value)}
            initialFollowupSnapshot={initialFollowupSnapshot ?? undefined}
            askBobAppointmentScheduled={sessionAskBobAppointment ?? undefined}
            onAskBobAppointmentScheduled={handleAskBobAppointmentScheduled}
            onFollowupSummaryUpdate={setFollowupSummary}
            onFollowupResult={handleFollowupResult}
            onJumpToCallAssist={handleJumpToCallAssist}
          />
        </AskBobSection>
        <AskBobSection id="askbob-scheduler">
          <AskBobSchedulerPanel
            workspaceId={workspaceId}
            jobId={jobId}
            customerId={customerId ?? null}
            jobTitle={normalizedJobTitle}
            jobDescription={jobDescription ?? null}
            diagnosisSummaryForScheduler={diagnosisSummary}
            materialsSummaryForScheduler={materialsSummary}
            quoteSummaryForScheduler={quoteSummary}
            followupSummaryForScheduler={followupSummary}
            stepCompleted={schedulerDone}
            resetToken={schedulerResetToken}
            onReset={handleSchedulerReset}
            stepCollapsed={schedulerCollapsed}
            onToggleStepCollapsed={() => setSchedulerCollapsed((value) => !value)}
            onAppointmentScheduled={handleAskBobAppointmentScheduled}
            onScrollIntoView={() => scrollToSection("askbob-scheduler")}
          />
        </AskBobSection>
        <AskBobSection id="askbob-call-script">
          <AskBobCallAssistPanel
            stepNumber={7}
            stepCompleted={callScriptDone}
            stepCollapsed={callScriptCollapsed}
            onToggleCollapse={() => setCallScriptCollapsed((value) => !value)}
            workspaceId={workspaceId}
            userId={userId}
            jobId={jobId}
            customerId={customerId ?? null}
            customerDisplayName={customerDisplayName ?? null}
            customerPhoneNumber={customerPhoneNumber ?? null}
            jobTitle={normalizedJobTitle || null}
            jobDescription={jobDescription ?? null}
            diagnosisSummary={diagnosisSummary}
            materialsSummary={materialsSummary}
            lastQuoteSummary={lastQuoteSummary ?? null}
            followupSummary={followupSummary}
            followupCallRecommended={followupCallRecommended}
            followupCallPurpose={followupCallPurpose}
            followupCallTone={followupCallTone}
            callScriptSummary={callScriptSummary}
            onCallScriptSummaryChange={setCallScriptSummary}
            onStartCallWithScript={handleStartCallWithScript}
          />
        </AskBobSection>
      </div>
    </div>
  );
}
