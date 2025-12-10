"use client";

import { useState } from "react";

import AskBobSection from "@/components/askbob/AskBobSection";
import AskBobMaterialsPanel, { type MaterialsSummaryContext } from "@/components/askbob/AskBobMaterialsPanel";
import AskBobQuotePanel from "@/components/askbob/AskBobQuotePanel";
import JobAskBobFollowupPanel from "@/components/askbob/JobAskBobFollowupPanel";
import JobAskBobPanel, { type JobDiagnosisContext } from "@/components/askbob/JobAskBobPanel";
import JobAskBobContainer from "@/components/askbob/JobAskBobContainer";
import { formatFriendlyDateTime } from "@/utils/timeline/formatters";
import {
  adaptAskBobMaterialsToSmartQuote,
  summarizeMaterialsSuggestion,
} from "@/lib/domain/quotes/materials-askbob-adapter";
import type {
  AskBobDiagnoseSnapshotPayload,
  AskBobFollowupSnapshotPayload,
  AskBobMaterialsSnapshotPayload,
  AskBobQuoteSnapshotPayload,
} from "@/lib/domain/askbob/types";
import { buildDiagnosisSummary } from "@/lib/domain/askbob/summary";

type JobAskBobFlowProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
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
};

type SessionQuote = {
  quoteId: string;
  createdAtIso: string | null;
  friendlyLabel: string | null;
};

export default function JobAskBobFlow({
  workspaceId,
  jobId,
  customerId,
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
  const [diagnoseCollapsed, setDiagnoseCollapsed] = useState(false);
  const [materialsCollapsed, setMaterialsCollapsed] = useState(false);
  const [quoteCollapsed, setQuoteCollapsed] = useState(false);
  const [followupCollapsed, setFollowupCollapsed] = useState(false);
  const [hasAutoCollapsedAllSteps, setHasAutoCollapsedAllSteps] = useState(false);
  const [followupDone, setFollowupDone] = useState(false);
  const [materialsResetToken, setMaterialsResetToken] = useState(0);
  const [quoteResetToken, setQuoteResetToken] = useState(0);
  const [followupResetToken, setFollowupResetToken] = useState(0);

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
  const stepStatusItems = [
    { label: "Step 1 Intake", done: true },
    { label: "Step 2 Diagnose", done: diagnosisDone },
    { label: "Step 3 Materials checklist", done: materialsDone },
    { label: "Step 4 Quote suggestion", done: quoteDone },
    { label: "Step 5 Follow-up guidance", done: followupDone },
  ];

  const promptSeed = jobDescription ?? "";
  const normalizedJobTitle = jobTitle?.trim() ?? "";

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
  };

  const handleQuoteReset = () => {
    setSessionQuote(null);
    setFollowupDone(false);
    setQuoteResetToken((value) => value + 1);
    setFollowupResetToken((value) => value + 1);
  };

  const handleFollowupCompleted = () => {
    const followupNowDone = true;
    setFollowupDone(followupNowDone);
    if (
      !hasAutoCollapsedAllSteps &&
      diagnosisDone &&
      materialsDone &&
      quoteDone &&
      followupNowDone
    ) {
      setDiagnoseCollapsed(true);
      setMaterialsCollapsed(true);
      setQuoteCollapsed(true);
      setFollowupCollapsed(true);
      setHasAutoCollapsedAllSteps(true);
    }
  };
  const handleFollowupReset = () => {
    setFollowupDone(false);
    setFollowupResetToken((value) => value + 1);
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
          />
        </AskBobSection>
      </div>
    </div>
  );
}
