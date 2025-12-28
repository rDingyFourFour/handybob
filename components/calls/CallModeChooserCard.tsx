"use client";

import React from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";

export type CallSessionMode = "automated" | "manual";

type CallModeChooserCardProps = {
  mode: CallSessionMode | null;
  onSelect: (mode: CallSessionMode) => void;
  automatedEligible: boolean;
  manualEligible: boolean;
  automatedDisabledReason?: "missing_phone" | "missing_script" | null;
  manualDisabledReason?: "missing_phone" | null;
};

const OPTION_COPY: Record<CallSessionMode, { title: string; description: string; helper: string }> = {
  automated: {
    title: callSessionCopy.mode.automated.label,
    description: callSessionCopy.mode.automated.description,
    helper: callSessionCopy.mode.automated.helper,
  },
  manual: {
    title: callSessionCopy.mode.manual.label,
    description: callSessionCopy.mode.manual.description,
    helper: callSessionCopy.mode.manual.helper,
  },
};

function resolveButtonLabel(mode: CallSessionMode, selectedMode: CallSessionMode | null) {
  if (!selectedMode) {
    return mode === "automated"
      ? callSessionCopy.mode.automated.selectLabel
      : callSessionCopy.mode.manual.selectLabel;
  }
  if (selectedMode === mode) {
    return callSessionCopy.mode.selectedLabel;
  }
  return callSessionCopy.mode.changeLabel;
}

function resolveDisabledReason(reason?: "missing_phone" | "missing_script" | null) {
  if (reason === "missing_phone") {
    return callSessionCopy.disabled.missingPhone;
  }
  if (reason === "missing_script") {
    return callSessionCopy.disabled.missingScript;
  }
  return null;
}

export default function CallModeChooserCard({
  mode,
  onSelect,
  automatedEligible,
  manualEligible,
  automatedDisabledReason,
  manualDisabledReason,
}: CallModeChooserCardProps) {
  const visibleOptions: CallSessionMode[] = mode ? [mode] : ["automated", "manual"];
  const alternateMode: CallSessionMode | null =
    mode === "automated" ? "manual" : mode === "manual" ? "automated" : null;

  return (
    <HbCard data-testid="call-session-mode-chooser" className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {callSessionCopy.mode.kicker}
        </p>
        <h2 className="hb-heading-3 text-xl font-semibold text-white">
          {callSessionCopy.mode.title}
        </h2>
        <p className="text-sm text-slate-400">{callSessionCopy.mode.helper}</p>
      </div>

      <div className={`grid gap-3 ${mode ? "" : "md:grid-cols-2"}`}>
        {visibleOptions.map((option) => {
          const selected = mode === option;
          const isEligible = option === "automated" ? automatedEligible : manualEligible;
          const disabledReason =
            option === "automated"
              ? resolveDisabledReason(automatedDisabledReason)
              : resolveDisabledReason(manualDisabledReason);
          const showDisabledReason = Boolean(!isEligible && disabledReason);
          return (
            <div
              key={option}
              data-testid={`call-mode-option-${option}`}
              data-selected={selected ? "true" : "false"}
              className={`space-y-3 rounded-2xl border px-4 py-3 ${
                selected
                  ? "border-amber-400/60 bg-amber-500/10 text-amber-100"
                  : "border-slate-800 bg-slate-950/40 text-slate-200"
              }`}
            >
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  {selected ? callSessionCopy.mode.optionTagSelected : callSessionCopy.mode.optionTagDefault}
                </p>
                <h3 className="text-lg font-semibold">{OPTION_COPY[option].title}</h3>
                <p className="text-sm text-slate-400">{OPTION_COPY[option].description}</p>
                <p className="text-xs text-slate-500">{OPTION_COPY[option].helper}</p>
                {showDisabledReason && (
                  <p className="text-xs text-amber-300">{disabledReason}</p>
                )}
              </div>
              <HbButton
                type="button"
                variant={selected ? "ghost" : "secondary"}
                size="sm"
                className="w-full"
                onClick={() => onSelect(option)}
                disabled={selected || !isEligible}
                data-testid={`call-mode-select-${option}`}
              >
                {resolveButtonLabel(option, mode)}
              </HbButton>
            </div>
          );
        })}
      </div>
      {!mode && (
        <p className="text-xs text-slate-400">{callSessionCopy.mode.unselectedHelper}</p>
      )}
      {alternateMode && (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{callSessionCopy.mode.switchPrompt}</span>
          <HbButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelect(alternateMode)}
            data-testid={`call-mode-switch-${alternateMode}`}
          >
            {alternateMode === "automated"
              ? callSessionCopy.mode.switchToAutomated
              : callSessionCopy.mode.switchToManual}
          </HbButton>
        </div>
      )}
    </HbCard>
  );
}
