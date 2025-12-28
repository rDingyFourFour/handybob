"use client";

import React from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";

export type CallSessionMode = "automated" | "manual";

type CallModeChooserCardProps = {
  mode: CallSessionMode | null;
  onSelect: (mode: CallSessionMode) => void;
};

const OPTION_COPY: Record<CallSessionMode, { title: string; description: string }> = {
  automated: {
    title: "AskBob automated call",
    description: "Let AskBob place the call, capture the recording, and summarize the outcome.",
  },
  manual: {
    title: "Manual guided call",
    description: "Call the customer yourself with scripts, prompts, and follow-up help.",
  },
};

function resolveButtonLabel(mode: CallSessionMode, selectedMode: CallSessionMode | null) {
  if (!selectedMode) {
    return mode === "automated" ? "Select automated" : "Select manual";
  }
  if (selectedMode === mode) {
    return "Selected";
  }
  return "Change";
}

export default function CallModeChooserCard({ mode, onSelect }: CallModeChooserCardProps) {
  return (
    <HbCard data-testid="call-mode-chooser-card" className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call choice</p>
        <h2 className="hb-heading-3 text-xl font-semibold text-white">
          Choose how to place this call
        </h2>
        <p className="text-sm text-slate-400">
          Pick automated or manual guidance so we can focus the next steps.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(Object.keys(OPTION_COPY) as CallSessionMode[]).map((option) => {
          const selected = mode === option;
          return (
            <div
              key={option}
              data-testid={`call-mode-option-${option}`}
              className={`space-y-3 rounded-2xl border px-4 py-3 ${
                selected
                  ? "border-amber-400/60 bg-amber-500/10 text-amber-100"
                  : "border-slate-800 bg-slate-950/40 text-slate-200"
              }`}
            >
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  {selected ? "Selected" : "Option"}
                </p>
                <h3 className="text-lg font-semibold">{OPTION_COPY[option].title}</h3>
                <p className="text-sm text-slate-400">{OPTION_COPY[option].description}</p>
              </div>
              <HbButton
                type="button"
                variant={selected ? "ghost" : "secondary"}
                size="sm"
                className="w-full"
                onClick={() => onSelect(option)}
                disabled={selected}
                data-testid={`call-mode-select-${option}`}
              >
                {resolveButtonLabel(option, mode)}
              </HbButton>
            </div>
          );
        })}
      </div>
    </HbCard>
  );
}
