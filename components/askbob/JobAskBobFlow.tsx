"use client";

import { useState } from "react";

import AskBobSection from "@/components/askbob/AskBobSection";
import AskBobMaterialsPanel, { type MaterialsSummaryContext } from "@/components/askbob/AskBobMaterialsPanel";
import AskBobQuotePanel from "@/components/askbob/AskBobQuotePanel";
import JobAskBobFollowupPanel from "@/components/askbob/JobAskBobFollowupPanel";
import JobAskBobPanel, { type JobDiagnosisContext } from "@/components/askbob/JobAskBobPanel";
import JobAskBobContainer from "@/components/askbob/JobAskBobContainer";

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
  hasQuoteContextForFollowup?: boolean;
  lastQuoteId?: string | null;
  lastQuoteCreatedAt?: string | null;
  lastQuoteCreatedAtFriendly?: string | null;
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
  hasQuoteContextForFollowup,
  lastQuoteId,
  lastQuoteCreatedAt,
  lastQuoteCreatedAtFriendly,
}: JobAskBobFlowProps) {
  const [diagnosisSummary, setDiagnosisSummary] = useState<string | null>(null);
  const [materialsSummary, setMaterialsSummary] = useState<string | null>(null);
  const [hasLocalAskBobQuoteFromFlow, setHasLocalAskBobQuoteFromFlow] = useState(false);
  const [stepDiagnoseDone, setStepDiagnoseDone] = useState(false);
  const [stepMaterialsDone, setStepMaterialsDone] = useState(false);
  const [stepQuoteDone, setStepQuoteDone] = useState(false);
  const [stepFollowupDone, setStepFollowupDone] = useState(false);
  const [materialsResetToken, setMaterialsResetToken] = useState(0);
  const [quoteResetToken, setQuoteResetToken] = useState(0);
  const [followupResetToken, setFollowupResetToken] = useState(0);

  const combinedHasQuoteContextForFollowup =
    Boolean(hasQuoteContextForFollowup) || hasLocalAskBobQuoteFromFlow;

  const stepStatusItems = [
    { label: "Step 2 Diagnose", done: stepDiagnoseDone },
    { label: "Step 3 Materials checklist", done: stepMaterialsDone },
    { label: "Step 4 Quote suggestion", done: stepQuoteDone },
    { label: "Step 5 Follow-up guidance", done: stepFollowupDone },
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
    setMaterialsSummary(null);
    setHasLocalAskBobQuoteFromFlow(false);
    setStepDiagnoseDone(Boolean(summary));
    setStepMaterialsDone(false);
    setStepQuoteDone(false);
    setStepFollowupDone(false);
    setMaterialsResetToken((value) => value + 1);
    setQuoteResetToken((value) => value + 1);
    setFollowupResetToken((value) => value + 1);
  };

  const handleMaterialsSummaryChange = (context: MaterialsSummaryContext) => {
    const summary = context.materialsSummary?.trim() ?? null;
    setMaterialsSummary(summary);
    const materialsCount = context.materialsCount ?? 0;
    setStepMaterialsDone(materialsCount > 0);
    setHasLocalAskBobQuoteFromFlow(false);
    setStepQuoteDone(false);
    setStepFollowupDone(false);
    setQuoteResetToken((value) => value + 1);
    setFollowupResetToken((value) => value + 1);
    if (!summary) {
      setMaterialsResetToken((value) => value + 1);
    }
  };

  const handleAskBobQuoteApplied = () => {
    setHasLocalAskBobQuoteFromFlow(true);
    setStepQuoteDone(true);
    setStepFollowupDone(false);
    setFollowupResetToken((value) => value + 1);
  };

  const handleQuoteReset = () => {
    setHasLocalAskBobQuoteFromFlow(false);
    setStepQuoteDone(false);
    setStepFollowupDone(false);
    setQuoteResetToken((value) => value + 1);
    setFollowupResetToken((value) => value + 1);
  };

  const handleFollowupCompleted = () => {
    setStepFollowupDone(true);
  };

  const handleFollowupReset = () => {
    setStepFollowupDone(false);
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
            onDiagnoseSuccess={() => scrollToSection("askbob-materials")}
            onDiagnoseComplete={handleDiagnoseComplete}
            stepCompleted={stepDiagnoseDone}
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
            stepCompleted={stepMaterialsDone}
            resetToken={materialsResetToken}
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
            stepCompleted={stepQuoteDone}
            resetToken={quoteResetToken}
            onQuoteReset={handleQuoteReset}
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
            lastQuoteIdForFollowup={lastQuoteId ?? undefined}
            lastQuoteCreatedAtForFollowup={lastQuoteCreatedAt ?? undefined}
            lastQuoteCreatedAtFriendlyForFollowup={lastQuoteCreatedAtFriendly ?? undefined}
            stepCompleted={stepFollowupDone}
            onFollowupCompleted={handleFollowupCompleted}
            resetToken={followupResetToken}
            onReset={handleFollowupReset}
          />
        </AskBobSection>
      </div>
    </div>
  );
}
