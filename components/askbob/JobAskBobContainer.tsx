"use client";

import HbCard from "@/components/ui/hb-card";
import JobAskBobHud from "@/components/askbob/JobAskBobHud";

type StepStatusItem = {
  label: string;
  done: boolean;
};

type JobAskBobContainerProps = {
  askBobLastTaskLabel?: string | null;
  askBobLastUsedAtDisplay?: string | null;
  askBobLastUsedAtIso?: string | null;
  askBobRunsSummary?: string | null;
  stepStatusItems: StepStatusItem[];
};

export default function JobAskBobContainer({
  askBobLastTaskLabel,
  askBobLastUsedAtDisplay,
  askBobLastUsedAtIso,
  askBobRunsSummary,
  stepStatusItems,
}: JobAskBobContainerProps) {
  const flowReminder =
    "Step 1 intake ran when this job was created; continue through Steps 2–5 to keep refining the scope.";

  return (
    <HbCard className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob Job Assistant</p>
        <h2 className="hb-heading-3 text-xl font-semibold">AskBob job assistant for this job</h2>
        <p className="text-sm text-slate-300">
          AskBob reviews this job’s title and description to help you diagnose issues, list materials, draft quotes, and plan follow-ups. Treat every suggestion as approximate and review the details before sharing them with a customer.
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
    </HbCard>
  );
}
