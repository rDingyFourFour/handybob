"use client";

import { useState } from "react";

import HbCard from "@/components/ui/hb-card";
import AskBobSection from "@/components/askbob/AskBobSection";
import AskBobMaterialsPanel from "@/components/askbob/AskBobMaterialsPanel";
import AskBobQuotePanel from "@/components/askbob/AskBobQuotePanel";
import JobAskBobFollowupPanel from "@/components/askbob/JobAskBobFollowupPanel";
import JobAskBobHud from "@/components/askbob/JobAskBobHud";
import JobAskBobPanel from "@/components/askbob/JobAskBobPanel";
import type { AskBobResponseDTO } from "@/lib/domain/askbob/types";

function buildDiagnosisSummary(response: AskBobResponseDTO): string | null {
  const normalizeItems = (sectionItems: string[]) =>
    sectionItems
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 2);

  const stepsSection =
    response.sections.find((section) => section.type === "steps" && section.items.some(Boolean)) ??
    response.sections.find((section) => section.items.some(Boolean));
  const stepItems = stepsSection ? normalizeItems(stepsSection.items) : [];
  const majorScope = stepItems.length ? `${stepsSection?.title ?? "Diagnosis"}: ${stepItems.join("; ")}` : null;

  const safetySection = response.sections.find(
    (section) => section.type === "safety" && section.items.some(Boolean)
  );
  const safetyItem = safetySection?.items.map((item) => item.trim()).find(Boolean) ?? null;

  const summaryParts = [];
  if (majorScope) {
    summaryParts.push(majorScope);
  }
  if (safetyItem) {
    summaryParts.push(`Safety note: ${safetyItem}`);
  }

  if (!summaryParts.length) {
    return null;
  }

  return summaryParts.join(" ");
}

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
}: JobAskBobContainerProps) {
  const promptSeed = jobDescription ?? "";
  const effectiveJobTitle = jobTitle?.trim() || "";
  const hasJobDescription = Boolean(jobDescription?.trim());
  const diagnoseDescription = hasJobDescription
    ? "AskBob starts with the job description below. Add what you’re seeing on-site (symptoms, constraints, notes from the customer) so it can deliver a diagnostic plan before you move to materials or quoting."
    : "Describe what you’re seeing on-site (symptoms, constraints, notes from the customer). AskBob will suggest a diagnostic plan you can adjust before tackling materials or a quote.";
  const [diagnosisSummary, setDiagnosisSummary] = useState<string | null>(null);
  const [materialsSummary, setMaterialsSummary] = useState<string | null>(null);

  const handleDiagnoseComplete = (response: AskBobResponseDTO) => {
    setDiagnosisSummary(buildDiagnosisSummary(response));
  };
  const handleMaterialsSummaryChange = (summary: string | null) => {
    setMaterialsSummary(summary);
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
        <h2 className="hb-heading-3 text-xl font-semibold">AskBob Job Assistant</h2>
        <p className="text-sm text-slate-300">
          AskBob is your AI job assistant for diagnosing this job, planning materials, and drafting a quote. Start here to run AI on the job before you move downstream.
        </p>
        <p className="text-xs text-slate-500">
          Suggestions are AI-generated, editable, and only saved when you choose to persist them.
        </p>
        <JobAskBobHud
          lastTaskLabel={askBobLastTaskLabel}
          lastUsedAtDisplay={askBobLastUsedAtDisplay}
          lastUsedAtIso={askBobLastUsedAtIso}
          runsSummary={askBobRunsSummary}
        />
      </div>
      <div className="space-y-8">
        <AskBobSection
          id="askbob-diagnose"
          title="Step 1 – Diagnose this job"
          description={diagnoseDescription}
        >
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
        <AskBobSection
          id="askbob-materials"
          title="Step 2 – List materials for this job"
          description="Use the diagnosis to ask AskBob for the materials you’ll need before you finalize anything."
        >
          <AskBobMaterialsPanel
            workspaceId={workspaceId}
            jobId={jobId}
            customerId={customerId ?? null}
            onMaterialsSuccess={() => scrollToSection("askbob-quote")}
            diagnosisSummary={diagnosisSummary}
            onMaterialsSummaryChange={handleMaterialsSummaryChange}
            jobDescription={jobDescription ?? null}
            jobTitle={effectiveJobTitle}
          />
        </AskBobSection>
        <AskBobSection
          id="askbob-quote"
          title="Step 3 – Generate a quote"
          description="Combine your diagnosis with the materials list from Step 2 so AskBob can build a customer-ready quote."
        >
          <AskBobQuotePanel
            workspaceId={workspaceId}
            jobId={jobId}
            customerId={customerId ?? null}
            onQuoteSuccess={() => scrollToSection("askbob-followup")}
            diagnosisSummary={diagnosisSummary}
            materialsSummary={materialsSummary}
            jobDescription={jobDescription ?? null}
            jobTitle={effectiveJobTitle}
          />
        </AskBobSection>
        <AskBobSection
          id="askbob-followup"
          title="Step 4 – Follow up with the customer"
          description="AskBob can help you decide when and how to follow up."
        >
          <JobAskBobFollowupPanel
            workspaceId={workspaceId}
            jobId={jobId}
            customerId={customerId ?? null}
            jobTitle={effectiveJobTitle}
          />
        </AskBobSection>
      </div>
    </HbCard>
  );
}
