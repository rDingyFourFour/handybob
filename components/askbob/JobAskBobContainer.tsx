"use client";

import { ReactNode } from "react";

import HbCard from "@/components/ui/hb-card";
import JobAskBobHud from "@/components/askbob/JobAskBobHud";

type JobAskBobContainerProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  askBobLastTaskLabel?: string | null;
  askBobLastUsedAtDisplay?: string | null;
  askBobLastUsedAtIso?: string | null;
  askBobRunsSummary?: string | null;
  children?: ReactNode;
};

export default function JobAskBobContainer({
  askBobLastTaskLabel,
  askBobLastUsedAtDisplay,
  askBobLastUsedAtIso,
  askBobRunsSummary,
  children,
}: JobAskBobContainerProps) {
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
      <div className="space-y-5">{children}</div>
    </HbCard>
  );
}
