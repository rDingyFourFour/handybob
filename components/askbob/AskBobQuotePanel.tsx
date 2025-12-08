"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { formatCurrency } from "@/utils/timeline/formatters";
import { runAskBobQuoteGenerateAction } from "@/app/(app)/askbob/quote-actions";
import { createQuoteFromAskBobAction } from "@/app/(app)/quotes/askbob-actions";
import { SmartQuoteSuggestion } from "@/lib/domain/quotes/askbob-adapter";

type AskBobQuotePanelProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
};

const DEFAULT_PROMPT = "Generate a standard quote for this job.";

export default function AskBobQuotePanel(props: AskBobQuotePanelProps) {
  const { jobId } = props;
  const router = useRouter();
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SmartQuoteSuggestion | null>(null);

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("Please describe the quote you’d like AskBob to create.");
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const result = await runAskBobQuoteGenerateAction({
        jobId,
        prompt: trimmedPrompt,
        extraDetails: "Use homeowner-friendly language with realistic mid-range pricing.",
      });

      setSuggestion(result.suggestion);
    } catch (error) {
      console.error("[askbob-quote-ui] action failure", error);
      setError("AskBob couldn’t generate a quote. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplySuggestion = async () => {
    if (!suggestion) return;

    setApplyError(null);
    setIsApplying(true);

    try {
      const result = await createQuoteFromAskBobAction({
        jobId,
        suggestion,
      });

      if (result.ok) {
        router.push(`/quotes/${result.quoteId}`);
        return;
      }

      setApplyError(result.error ?? "Couldn’t create a quote from this suggestion. Please try again.");
    } catch (error) {
      console.error("[askbob-quote-ui] apply failure", error);
      setApplyError("Couldn’t create a quote from this suggestion. Please try again.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <HbCard className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob quote</p>
        <h2 className="hb-heading-3 text-xl font-semibold">Generate quote with AskBob</h2>
        <p className="text-sm text-slate-400">
          AskBob can suggest a scoped quote for this job based on what you need it to cover.
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="askbob-quote-prompt" className="text-xs uppercase tracking-[0.3em] text-slate-500">
          Description
        </label>
        <textarea
          id="askbob-quote-prompt"
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe the scope and expectations for the quote."
          aria-label="Prompt for AskBob quote generation"
        />
        <div className="flex items-center gap-3">
          <HbButton onClick={handleGenerate} disabled={isLoading || isApplying} variant="secondary" size="sm">
            {isLoading ? "Generating AskBob quote…" : "Generate quote with AskBob"}
          </HbButton>
          <p className="text-xs text-slate-500">
            The suggestion stays in memory and won’t be saved until you copy it into a quote.
          </p>
        </div>
        {error && <p className="text-sm text-rose-300">{error}</p>}
      </div>
      {suggestion && (
        <div className="space-y-3 border-t border-slate-800 pt-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
              AskBob quote suggestion (not yet saved)
            </p>
          </div>
          <div className="space-y-2">
            {suggestion.scopeLines.map((line, index) => (
              <div key={`${line.description}-${index}`} className="flex justify-between text-sm">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-100">{line.description}</p>
                  <p className="text-xs text-slate-500">
                    Qty: {line.quantity}
                    {line.unit ? ` ${line.unit}` : ""}
                    {line.unitPrice != null ? ` · ${formatCurrency(line.unitPrice)} per unit` : ""}
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-100">
                  {line.lineTotal != null
                    ? formatCurrency(line.lineTotal)
                    : line.unitPrice != null
                    ? formatCurrency(line.unitPrice * line.quantity)
                    : "—"}
                </p>
              </div>
            ))}
          </div>
          {suggestion.materials && suggestion.materials.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Materials estimate</p>
              <div className="space-y-1">
                {suggestion.materials.map((material, index) => (
                  <div key={`${material.name}-${index}`} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-semibold text-slate-100">{material.name}</p>
                      <p className="text-xs text-slate-500">
                        Qty: {material.quantity}
                        {material.unit ? ` ${material.unit}` : ""}
                      </p>
                    </div>
                    <p className="text-sm text-slate-100">
                      {material.estimatedTotalCost != null
                        ? formatCurrency(material.estimatedTotalCost)
                        : material.estimatedUnitCost != null
                        ? formatCurrency(material.estimatedUnitCost * material.quantity)
                        : "—"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {suggestion.notes && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Notes</p>
              <p className="text-sm text-slate-300">{suggestion.notes}</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <HbButton
              onClick={handleApplySuggestion}
              disabled={isApplying || isLoading}
              variant="secondary"
              size="sm"
            >
              {isApplying ? "Applying AskBob suggestion…" : "Create quote from AskBob suggestion"}
            </HbButton>
            {applyError && <p className="text-sm text-rose-300">{applyError}</p>}
          </div>
        </div>
      )}
    </HbCard>
  );
}
