"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { formatCurrency } from "@/utils/timeline/formatters";
import { SmartQuoteSuggestion } from "@/lib/domain/quotes/askbob-adapter";
import { applyAskBobMaterialsQuoteAction } from "@/app/(app)/quotes/askbob-materials-actions";
import { runAskBobMaterialsGenerateAction } from "@/app/(app)/askbob/materials-actions";

type AskBobMaterialsPanelProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  onMaterialsSuccess?: () => void;
};

const DEFAULT_PROMPT = "List the materials needed for this job.";

export default function AskBobMaterialsPanel(props: AskBobMaterialsPanelProps) {
  const { jobId, onMaterialsSuccess } = props;
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [extraDetails, setExtraDetails] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SmartQuoteSuggestion | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const router = useRouter();

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("Please describe the materials you’d like AskBob to suggest.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setApplyError(null);
    try {
      const result = await runAskBobMaterialsGenerateAction({
        jobId,
        prompt: trimmedPrompt,
        extraDetails: extraDetails.trim() || null,
      });

      setSuggestion(result.suggestion);
      onMaterialsSuccess?.();
    } catch (err) {
      console.error("[askbob-materials-ui] action failure", err);
      setError("AskBob couldn’t generate materials. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplySuggestion = async () => {
    if (!suggestion) {
      return;
    }
    setApplyError(null);
    setIsApplying(true);
    try {
      const result = await applyAskBobMaterialsQuoteAction({
        jobId,
        suggestion,
      });
      if (!result.ok) {
        console.error("[askbob-materials-ui] apply action failed", result.error);
        setApplyError("Couldn’t create a materials quote from this suggestion. Please try again.");
        return;
      }
      void router.push(`/quotes/${result.materialsQuoteId}`);
    } catch (err) {
      console.error("[askbob-materials-ui] apply action error", err);
      setApplyError("Couldn’t create a materials quote from this suggestion. Please try again.");
    } finally {
      setIsApplying(false);
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
        <h2 className="hb-heading-3 text-xl font-semibold">AskBob materials helper</h2>
        <p className="text-sm text-slate-400">
          Use this after you’ve outlined the scope so AskBob can recommend materials before you save anything.
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
        <div className="flex items-center gap-3">
          <HbButton onClick={handleGenerate} disabled={isLoading} variant="secondary" size="sm">
            {isLoading ? "Generating AskBob materials…" : "Generate materials with AskBob"}
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
          <div className="flex flex-col gap-2">
            <HbButton
              variant="secondary"
              size="sm"
              onClick={handleApplySuggestion}
              disabled={isApplying}
            >
              {isApplying
                ? "Creating materials quote…"
                : "Create materials quote from AskBob suggestion"}
            </HbButton>
            {applyError && <p className="text-sm text-rose-300">{applyError}</p>}
          </div>
        </div>
      )}
    </HbCard>
  );
}
