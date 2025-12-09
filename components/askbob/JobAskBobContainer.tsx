"use client";

import HbCard from "@/components/ui/hb-card";
import AskBobSection from "@/components/askbob/AskBobSection";
import AskBobMaterialsPanel from "@/components/askbob/AskBobMaterialsPanel";
import AskBobQuotePanel from "@/components/askbob/AskBobQuotePanel";
import JobAskBobFollowupPanel from "@/components/askbob/JobAskBobFollowupPanel";
import JobAskBobHud from "@/components/askbob/JobAskBobHud";
import JobAskBobPanel from "@/components/askbob/JobAskBobPanel";

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
          title="1. Diagnose the issue"
          description="Describe what’s going wrong so AskBob can suggest a safe, step-by-step plan."
        >
          <JobAskBobPanel
            workspaceId={workspaceId}
            jobId={jobId}
            customerId={customerId ?? undefined}
            jobDescription={promptSeed}
            onDiagnoseSuccess={() => scrollToSection("askbob-quote")}
          />
        </AskBobSection>
        <AskBobSection
          id="askbob-quote"
          title="2. Generate a quote"
          description="Turn your diagnosis into a customer-ready quote you can review and edit."
        >
          <AskBobQuotePanel
            workspaceId={workspaceId}
            jobId={jobId}
            customerId={customerId ?? null}
            onQuoteSuccess={() => scrollToSection("askbob-materials")}
          />
        </AskBobSection>
        <AskBobSection
          id="askbob-materials"
          title="3. Recommend materials"
          description="Get a materials list that matches the scope of work."
        >
          <AskBobMaterialsPanel
            workspaceId={workspaceId}
            jobId={jobId}
            customerId={customerId ?? null}
            onMaterialsSuccess={() => scrollToSection("askbob-followup")}
          />
        </AskBobSection>
        <AskBobSection
          id="askbob-followup"
          title="4. Follow up with the customer"
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
