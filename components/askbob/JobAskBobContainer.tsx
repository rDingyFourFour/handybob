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
  const sections = response.sections
    .map((section) => {
      const items = section.items
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 2);
      if (!items.length) {
        return null;
      }
      return `${section.title}: ${items.join("; ")}`;
    })
    .filter(Boolean);

  if (!sections.length) {
    return null;
  }

  return sections.slice(0, 2).join(" · ");
}

type JobAskBobContainerProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  jobDescription?: string | null | undefined;
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
  askBobLastTaskLabel,
  askBobLastUsedAtDisplay,
  askBobLastUsedAtIso,
  askBobRunsSummary,
}: JobAskBobContainerProps) {
  const promptSeed = jobDescription ?? "";
  const hasJobDescription = Boolean(jobDescription?.trim());
  const diagnoseDescription = hasJobDescription
    ? "Start with the job description below. Add what you’re seeing on-site (symptoms, constraints, notes from the customer), then AskBob will suggest a step-by-step plan you can adjust."
    : "Describe what you’re seeing on-site (symptoms, constraints, notes from the customer), then AskBob will suggest a step-by-step plan you can adjust.";
  const [diagnosisSummary, setDiagnosisSummary] = useState<string | null>(null);

  const handleDiagnoseComplete = (response: AskBobResponseDTO) => {
    setDiagnosisSummary(buildDiagnosisSummary(response));
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
          Use AskBob to think through this job, draft quotes and materials, and prepare customer-ready messages.
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
          />
        </AskBobSection>
      </div>
    </HbCard>
  );
}
