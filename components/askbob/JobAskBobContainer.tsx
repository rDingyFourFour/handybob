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
}: JobAskBobContainerProps) {
  const promptSeed = jobDescription ?? "";
  const effectiveJobTitle = jobTitle?.trim() || "";
  const flowReminder = "Work through these steps in order, editing anything that doesn’t match what you see on site.";
  const [diagnosisSummary, setDiagnosisSummary] = useState<string | null>(null);
  const [materialsSummary, setMaterialsSummary] = useState<string | null>(null);
  const effectiveHasQuoteContextForFollowup = Boolean(hasQuoteContextForFollowup);

  const handleDiagnoseComplete = (context: JobDiagnosisContext) => {
    setDiagnosisSummary(context.diagnosisSummary);
    setMaterialsSummary(null);
  };
  const handleMaterialsSummaryChange = (context: MaterialsSummaryContext) => {
    setMaterialsSummary(context.materialsSummary);
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
            hasQuoteContextForFollowup={effectiveHasQuoteContextForFollowup}
          />
        </AskBobSection>
      </div>
    </HbCard>
  );
}
