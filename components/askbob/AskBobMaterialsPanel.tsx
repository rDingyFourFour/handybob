"use client";

import { useEffect, useRef, useState } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { formatCurrency } from "@/utils/timeline/formatters";
import type {
  AskBobMaterialsGenerateResult,
  AskBobMaterialsSnapshotPayload,
} from "@/lib/domain/askbob/types";
import {
  adaptAskBobMaterialsToSmartQuote,
  SmartQuoteSuggestion,
  summarizeMaterialsSuggestion,
} from "@/lib/domain/quotes/materials-askbob-adapter";
import { runAskBobMaterialsGenerateAction } from "@/app/(app)/askbob/materials-actions";

export type MaterialsSummaryContext = {
  materialsSummary: string | null;
  materialsCount?: number | null;
};

type AskBobMaterialsPanelProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  diagnosisSummaryForMaterials?: string | null;
  jobDescription?: string | null;
  onMaterialsSummaryChange?: (context: MaterialsSummaryContext) => void;
  onMaterialsSuccess?: () => void;
  jobTitle?: string | null;
  stepCompleted?: boolean;
  resetToken?: number;
  stepCollapsed?: boolean;
  onToggleStepCollapsed?: () => void;
  initialMaterialsSnapshot?: AskBobMaterialsSnapshotPayload | null;
};

type MaterialsExtraDetailsInput = {
  jobTitle?: string | null;
  technicianNotes?: string | null;
  diagnosisSummary?: string | null;
  jobDescription?: string | null;
};

function buildJobDescriptionSnippet(description?: string | null): string | null {
  if (!description) {
    return null;
  }
  const trimmed = description.trim();
  if (!trimmed) {
    return null;
  }
  const singleLine = trimmed.replace(/\s+/g, " ");
  return singleLine.length > 240 ? `${singleLine.slice(0, 240)}...` : singleLine;
}

function buildMaterialsExtraDetails({
  jobTitle,
  technicianNotes,
  diagnosisSummary,
  jobDescription,
}: MaterialsExtraDetailsInput): string | null {
  const parts: string[] = [];
  const normalizedJobTitle = jobTitle?.trim();
  if (normalizedJobTitle) {
    parts.push(`Job title: ${normalizedJobTitle}`);
  }
  const jobContext = buildJobDescriptionSnippet(jobDescription);
  if (jobContext) {
    parts.push(`Job description: ${jobContext}`);
  }
  if (technicianNotes?.trim()) {
    parts.push(`Technician notes about materials: ${technicianNotes.trim()}`);
  }
  if (diagnosisSummary?.trim()) {
    parts.push(`Diagnosis summary from Step 1: ${diagnosisSummary.trim()}`);
  }
  if (!parts.length) {
    return null;
  }
  return parts.join("\n\n");
}

const DEFAULT_PROMPT = "List the materials needed for this job.";

export default function AskBobMaterialsPanel(props: AskBobMaterialsPanelProps) {
  const {
    jobId,
    onMaterialsSuccess,
    diagnosisSummaryForMaterials,
    jobDescription,
    onMaterialsSummaryChange,
    jobTitle,
    stepCompleted,
    resetToken,
    stepCollapsed = false,
    onToggleStepCollapsed,
    initialMaterialsSnapshot,
  } = props;
  const initialMaterialsSuggestion = initialMaterialsSnapshot
    ? adaptAskBobMaterialsToSmartQuote({
        items: initialMaterialsSnapshot.items,
        notes: initialMaterialsSnapshot.notes ?? null,
        modelLatencyMs: 0,
        rawModelOutput: null,
      } as AskBobMaterialsGenerateResult)
    : null;
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [extraDetails, setExtraDetails] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SmartQuoteSuggestion | null>(
    initialMaterialsSuggestion,
  );
  const hasResetEffectRun = useRef(false);
  const normalizedJobTitle = jobTitle?.trim() ?? "";
  const normalizedJobDescription = jobDescription?.trim() ?? "";
  const normalizedDiagnosisSummary = diagnosisSummaryForMaterials?.trim() ?? "";
  const hasDiagnosisContextForMaterials = Boolean(normalizedDiagnosisSummary);
  const contextParts: string[] = [];
  if (normalizedJobTitle) {
    contextParts.push("job title");
  }
  if (normalizedJobDescription) {
    contextParts.push("job description");
  }
  if (hasDiagnosisContextForMaterials) {
    contextParts.push("AskBob diagnosis");
  }
  const materials = suggestion?.materials ?? [];
  const materialsCount = materials.length;
  const hasMaterials = materialsCount > 0;
  const hasMaterialsSuggestion = Boolean(suggestion);
  const toggleLabel = stepCollapsed ? "Show step" : "Hide step";
  const handleToggle = () => onToggleStepCollapsed?.();

  useEffect(() => {
    if (resetToken === undefined) {
      return;
    }
    if (!hasResetEffectRun.current) {
      hasResetEffectRun.current = true;
      return;
    }
    setSuggestion(null);
    setError(null);
    setIsLoading(false);
  }, [resetToken]);

  const handleReset = () => {
    setSuggestion(null);
    setError(null);
    setIsLoading(false);
    onMaterialsSummaryChange?.({ materialsSummary: null, materialsCount: null });
    if (typeof document === "undefined") {
      return;
    }
    const target = document.getElementById("askbob-materials");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("Please describe the materials you’d like AskBob to suggest.");
      return;
    }

    onMaterialsSummaryChange?.({ materialsSummary: null });

    setIsLoading(true);
    setError(null);
    try {
      const trimmedExtraDetails = extraDetails.trim();
      const extraDetailsPayload = buildMaterialsExtraDetails({
        technicianNotes: trimmedExtraDetails || null,
        diagnosisSummary: normalizedDiagnosisSummary || null,
        jobDescription,
      });
      const result = await runAskBobMaterialsGenerateAction({
        jobId,
        prompt: trimmedPrompt,
        extraDetails: extraDetailsPayload,
        jobTitle: normalizedJobTitle || undefined,
        diagnosisSummary: normalizedDiagnosisSummary || undefined,
        hasDiagnosisContextForMaterials,
        hasJobDescriptionContextForMaterials: Boolean(normalizedJobDescription),
      });

      setSuggestion(result.suggestion);
      const summary = summarizeMaterialsSuggestion(result.suggestion);
      const trimmedSummary = summary?.trim();
      const materialsSummary = trimmedSummary && trimmedSummary.length ? trimmedSummary : null;
      const materialsCount = result.suggestion.materials?.length ?? null;
      onMaterialsSummaryChange?.({ materialsSummary, materialsCount });
      onMaterialsSuccess?.();
    } catch (err) {
      console.error("[askbob-materials-ui] action failure", err);
      setError("AskBob couldn’t generate materials. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const renderCost = (line: SmartQuoteSuggestion["materials"][number]) => {
    if (!line) return "—";
    if (line.estimatedTotalCost != null) {
      return formatCurrency(line.estimatedTotalCost);
    }
    if (line.estimatedUnitCost != null) {
      return formatCurrency(line.estimatedUnitCost * line.quantity);
    }
    return "—";
  };

  return (
    <HbCard className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob materials</p>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <h2 className="hb-heading-3 text-xl font-semibold">Step 3 · Build a materials checklist</h2>
            {stepCompleted && (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold tracking-[0.3em] text-emerald-200">
                Done
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HbButton
              variant="ghost"
              size="sm"
              className="px-2 py-0.5 text-[11px] tracking-[0.3em]"
              onClick={handleToggle}
            >
              {toggleLabel}
            </HbButton>
            {hasMaterialsSuggestion && (
              <HbButton
                variant="ghost"
                size="sm"
                className="px-2 py-0.5 text-[11px] tracking-[0.3em]"
                onClick={handleReset}
              >
                Reset this step
              </HbButton>
            )}
          </div>
        </div>
      </div>
      {!stepCollapsed && (
        <>
          <div className="space-y-2">
            <p className="text-sm text-slate-400">
              AskBob suggests a materials checklist using the job title, description, and diagnosis notes.
              Treat it as a planning list and verify quantities, brands, and costs before you commit to an order.
            </p>
            {contextParts.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Context used: {contextParts.join(", ")}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Context used: none yet. Add the job details you want this checklist to reference.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.3em] text-slate-500" htmlFor="askbob-materials-prompt">
              Description
            </label>
            <textarea
              id="askbob-materials-prompt"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              rows={3}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the materials you want AskBob to list."
              aria-label="Prompt for AskBob materials generation"
            />
            <label className="text-xs uppercase tracking-[0.3em] text-slate-500" htmlFor="askbob-materials-extra">
              Extra details (optional)
            </label>
            <textarea
              id="askbob-materials-extra"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              rows={2}
              value={extraDetails}
              onChange={(event) => setExtraDetails(event.target.value)}
              placeholder="Add any notes that help AskBob fine-tune the list."
              aria-label="Extra details for AskBob materials generation"
            />
            <p className="text-xs text-slate-500">
              The diagnosis summary helps align the materials with the likely work scope.
            </p>
            <div className="flex items-center gap-3">
              <HbButton onClick={handleGenerate} disabled={isLoading} variant="secondary" size="sm">
                {isLoading ? "Generating AskBob materials…" : "Generate materials list with AskBob"}
              </HbButton>
              <p className="text-xs text-slate-500">
                Suggestions stay in memory and won’t be saved unless you copy them into a materials quote.
              </p>
            </div>
            {error && <p className="text-sm text-rose-300">{error}</p>}
          </div>

          {suggestion && (
            <div className="space-y-3 border-t border-slate-800 pt-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  AskBob materials suggestion (not yet saved)
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-100">Suggested materials from AskBob</p>
                {hasMaterials ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      AskBob suggested {materialsCount} material{materialsCount === 1 ? "" : "s"} for this job.
                      Double-check quantities and availability before ordering.
                    </p>
                    <div className="space-y-2">
                      {materials.map((item, index) => (
                        <div key={`${item.name}-${index}`} className="flex items-center justify-between text-sm">
                          <div>
                            <p className="font-semibold text-slate-100">{item.name}</p>
                            <p className="text-xs text-slate-500">
                              Qty: {item.quantity}
                              {item.unit ? ` ${item.unit}` : ""}
                            </p>
                          </div>
                          <p className="text-sm text-slate-100">{renderCost(item)}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="space-y-1 pt-1 text-sm text-muted-foreground">
                    <p>AskBob didn’t find any specific materials to list from this description.</p>
                    <p>You can update the notes above to be more specific, then ask again, or add your own checklist below.</p>
                  </div>
                )}
              </div>
              {suggestion.notes && (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Notes</p>
                  <p className="text-sm text-slate-300">{suggestion.notes}</p>
                </div>
              )}
              <p className="text-xs text-slate-400">
                Reference or copy these materials into your official list once you confirm fit, price, and availability.
              </p>
            </div>
          )}
        </>
      )}
    </HbCard>
  );
}
