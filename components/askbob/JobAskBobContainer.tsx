"use client";

import { useState } from "react";

import HbCard from "@/components/ui/hb-card";
import AskBobSection from "@/components/askbob/AskBobSection";
import AskBobMaterialsPanel from "@/components/askbob/AskBobMaterialsPanel";
import AskBobQuotePanel from "@/components/askbob/AskBobQuotePanel";
import JobAskBobFollowupPanel from "@/components/askbob/JobAskBobFollowupPanel";
import JobAskBobHud from "@/components/askbob/JobAskBobHud";
import JobAskBobPanel, { type JobDiagnosisContext } from "@/components/askbob/JobAskBobPanel";
import type { MaterialsSummaryContext } from "@/components/askbob/AskBobMaterialsPanel";

type JobAskBobContainerProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  jobDescription?: string | null | undefined;
  jobTitle?: string | null | undefined;
  askBobLastTaskLabel?: string | null;
  askBobLastUsedAtDisplay?: string | null;
  askBobLastUsedAtIso?: string | null;
  askBobRunsSummary?: string | null;
  hasQuoteContextForFollowup?: boolean;
  lastQuoteId?: string;
  lastQuoteCreatedAt?: string;
  lastQuoteCreatedAtFriendly?: string;
};

export default function JobAskBobContainer({
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
}: JobAskBobContainerProps) {
  const promptSeed = jobDescription ?? "";
  const effectiveJobTitle = jobTitle?.trim() || "";
  const flowReminder = "Work through these steps in order, editing anything that doesn’t match what you see on site.";
  const [diagnosisSummary, setDiagnosisSummary] = useState<string | null>(null);
  const [materialsSummary, setMaterialsSummary] = useState<string | null>(null);
  const [hasLocalAskBobQuoteFromFlow, setHasLocalAskBobQuoteFromFlow] = useState(false);
  const [step1DiagnoseDone, setStep1DiagnoseDone] = useState(false);
  const [step2MaterialsDone, setStep2MaterialsDone] = useState(false);
  const [step3QuoteDone, setStep3QuoteDone] = useState(false);
  const [step4FollowupDone, setStep4FollowupDone] = useState(false);
  const [materialsResetToken, setMaterialsResetToken] = useState(0);
  const [quoteResetToken, setQuoteResetToken] = useState(0);
  const [followupResetToken, setFollowupResetToken] = useState(0);
  const effectiveHasQuoteContextForFollowup = Boolean(hasQuoteContextForFollowup);
  const combinedHasQuoteContextForFollowup = effectiveHasQuoteContextForFollowup || hasLocalAskBobQuoteFromFlow;
  const stepStatusItems = [
    { label: "Step 1 Diagnose", done: step1DiagnoseDone },
    { label: "Step 2 Materials", done: step2MaterialsDone },
    { label: "Step 3 Quote", done: step3QuoteDone },
    { label: "Step 4 Follow-up", done: step4FollowupDone },
  ];

  const handleDiagnoseComplete = (context: JobDiagnosisContext) => {
    const summary = context.diagnosisSummary?.trim() ?? null;
    setDiagnosisSummary(summary);
    setMaterialsSummary(null);
    setHasLocalAskBobQuoteFromFlow(false);
    setStep1DiagnoseDone(Boolean(summary));
    setStep2MaterialsDone(false);
    setStep3QuoteDone(false);
    setStep4FollowupDone(false);
    setMaterialsResetToken((value) => value + 1);
    setQuoteResetToken((value) => value + 1);
    setFollowupResetToken((value) => value + 1);
  };
  const handleMaterialsSummaryChange = (context: MaterialsSummaryContext) => {
    const summary = context.materialsSummary?.trim() ?? null;
    setMaterialsSummary(summary);
    const materialsCount = context.materialsCount ?? 0;
    setStep2MaterialsDone(materialsCount > 0);
    setHasLocalAskBobQuoteFromFlow(false);
    setStep3QuoteDone(false);
    setStep4FollowupDone(false);
    setQuoteResetToken((value) => value + 1);
    setFollowupResetToken((value) => value + 1);
    if (!summary) {
      setMaterialsResetToken((value) => value + 1);
    }
  };

  const handleAskBobQuoteApplied = (quoteId: string) => {
    void quoteId;
    setHasLocalAskBobQuoteFromFlow(true);
    setStep3QuoteDone(true);
    setStep4FollowupDone(false);
    setFollowupResetToken((value) => value + 1);
  };

  const handleFollowupCompleted = () => {
    setStep4FollowupDone(true);
  };

  const handleQuoteReset = () => {
    setHasLocalAskBobQuoteFromFlow(false);
    setStep3QuoteDone(false);
    setStep4FollowupDone(false);
    setQuoteResetToken((value) => value + 1);
    setFollowupResetToken((value) => value + 1);
  };

  const handleFollowupReset = () => {
    setStep4FollowupDone(false);
    setFollowupResetToken((value) => value + 1);
  };

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

  return (
    <HbCard className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob Job Assistant</p>
        <h2 className="hb-heading-3 text-xl font-semibold">AskBob job assistant for this job</h2>
        <p className="text-sm text-slate-300">
          AskBob uses this job’s title and description to help you diagnose issues, list materials, draft quotes, and plan follow-ups. Everything is approximate and must be reviewed by a technician before it’s shared with a customer.
        </p>
        <p className="text-xs text-slate-500">{flowReminder}</p>
        <JobAskBobHud
          lastTaskLabel={askBobLastTaskLabel}
          lastUsedAtDisplay={askBobLastUsedAtDisplay}
          lastUsedAtIso={askBobLastUsedAtIso}
          runsSummary={askBobRunsSummary}
        />
      </div>
      <div className="space-y-1 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-400">
        {stepStatusItems.map((step) => (
          <div key={step.label} className="flex items-center justify-between">
            <span className="text-slate-200">{step.label}</span>
            <span
              className={`text-[11px] font-semibold uppercase ${step.done ? "text-emerald-300" : "text-slate-500"}`}
            >
              {step.done ? "Done" : "Not started"}
            </span>
          </div>
        ))}
      </div>
      <div className="space-y-8">
        <AskBobSection id="askbob-diagnose">
          <JobAskBobPanel
            workspaceId={workspaceId}
            jobId={jobId}
            customerId={customerId ?? undefined}
            jobDescription={promptSeed}
            jobTitle={effectiveJobTitle}
            onDiagnoseSuccess={() => scrollToSection("askbob-materials")}
            onDiagnoseComplete={handleDiagnoseComplete}
            stepCompleted={step1DiagnoseDone}
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
            jobTitle={effectiveJobTitle}
            stepCompleted={step2MaterialsDone}
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
            jobTitle={effectiveJobTitle}
            onQuoteApplied={handleAskBobQuoteApplied}
            onScrollToFollowup={() => scrollToSection("askbob-followup")}
            stepCompleted={step3QuoteDone}
            resetToken={quoteResetToken}
            onQuoteReset={handleQuoteReset}
          />
        </AskBobSection>
        <AskBobSection id="askbob-followup">
          <JobAskBobFollowupPanel
            workspaceId={workspaceId}
            jobId={jobId}
            customerId={customerId ?? null}
            jobTitle={effectiveJobTitle}
            jobDescription={jobDescription ?? null}
            diagnosisSummaryForFollowup={diagnosisSummary}
            materialsSummaryForFollowup={materialsSummary}
            hasQuoteContextForFollowup={combinedHasQuoteContextForFollowup}
            lastQuoteIdForFollowup={lastQuoteId}
            lastQuoteCreatedAtForFollowup={lastQuoteCreatedAt}
            lastQuoteCreatedAtFriendlyForFollowup={lastQuoteCreatedAtFriendly}
            stepCompleted={step4FollowupDone}
            onFollowupCompleted={handleFollowupCompleted}
            resetToken={followupResetToken}
            onReset={handleFollowupReset}
          />
        </AskBobSection>
      </div>
    </HbCard>
  );
}
