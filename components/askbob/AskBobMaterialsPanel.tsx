"use client";

import { useState } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { formatCurrency } from "@/utils/timeline/formatters";
import { SmartQuoteSuggestion } from "@/lib/domain/quotes/askbob-adapter";
import { runAskBobMaterialsGenerateAction } from "@/app/(app)/askbob/materials-actions";

type AskBobMaterialsPanelProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  diagnosisSummary?: string | null;
  jobDescription?: string | null;
  onMaterialsSummaryChange?: (summary: string | null) => void;
  onMaterialsSuccess?: () => void;
  jobTitle?: string | null;
};

function summarizeMaterialsSuggestion(suggestion: SmartQuoteSuggestion | null): string | null {
  if (!suggestion) {
    return null;
  }

  const materialsCount = suggestion.materials?.length ?? 0;
  const baseSentence =
    materialsCount > 0
      ? `AskBob suggested ${materialsCount} material${materialsCount === 1 ? "" : "s"} for this job.`
      : "AskBob suggested no specific materials for this job.";

  const notes = suggestion.notes?.trim();
  if (notes) {
    const firstSentence = notes.split(".")[0].trim();
    if (firstSentence) {
      return `${baseSentence} Notes: ${firstSentence}.`;
    }
  }

  return baseSentence;
}

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
  const { jobId, onMaterialsSuccess, diagnosisSummary, jobDescription, onMaterialsSummaryChange, jobTitle } =
    props;
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [extraDetails, setExtraDetails] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SmartQuoteSuggestion | null>(null);
  const normalizedJobTitle = jobTitle?.trim() ?? "";

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("Please describe the materials you’d like AskBob to suggest.");
      return;
    }

    onMaterialsSummaryChange?.(null);

    setIsLoading(true);
    setError(null);
    try {
      const trimmedExtraDetails = extraDetails.trim();
      const extraDetailsPayload = buildMaterialsExtraDetails({
        technicianNotes: trimmedExtraDetails || null,
        diagnosisSummary,
        jobDescription,
      });
      const result = await runAskBobMaterialsGenerateAction({
        jobId,
        prompt: trimmedPrompt,
        extraDetails: extraDetailsPayload,
        jobTitle: normalizedJobTitle || undefined,
        hasDiagnosisContextForMaterials: Boolean(diagnosisSummary?.trim()),
        hasJobDescriptionContextForMaterials: Boolean(jobDescription?.trim()),
      });

      setSuggestion(result.suggestion);
      const summary = summarizeMaterialsSuggestion(result.suggestion);
      onMaterialsSummaryChange?.(summary);
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
        <h2 className="hb-heading-3 text-xl font-semibold">Step 2 · Build a materials checklist</h2>
        <p className="text-sm text-slate-400">
          AskBob suggests a materials checklist using the job title, description, and your notes from Step 1. Use this as a
          planning list—verify quantities and brands before buying anything.
        </p>
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
          We include a short summary of your diagnosis so the materials match the likely work.
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
          {suggestion.materials && suggestion.materials.length > 0 ? (
            <div className="space-y-2">
              {suggestion.materials.map((item, index) => (
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
          ) : (
            <p className="text-sm text-slate-400">AskBob returned no materials for this prompt.</p>
          )}
          {suggestion.notes && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Notes</p>
              <p className="text-sm text-slate-300">{suggestion.notes}</p>
            </div>
          )}
          <p className="text-xs text-slate-400">
            Copy or reference these materials when you build your quote or materials list as needed.
          </p>
        </div>
      )}
    </HbCard>
  );
}
