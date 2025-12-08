"use client";

import { useState } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import type { AskBobLineExplanation } from "@/lib/domain/askbob/types";
import { explainQuoteWithAskBobAction } from "@/app/(app)/quotes/askbob-explain-actions";

type QuoteExplainPanelProps = {
  quoteId: string;
};

export default function QuoteExplainPanel({ quoteId }: QuoteExplainPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [lineExplanations, setLineExplanations] = useState<AskBobLineExplanation[] | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleExplain = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await explainQuoteWithAskBobAction({ quoteId });
      if (!result.ok) {
        setError(result.error ?? "AskBob couldn’t explain this quote. Please try again.");
        return;
      }
      setExplanation(result.explanation);
      setLineExplanations(result.lineExplanations ?? null);
    } catch (err) {
      console.error("[askbob-quote-explain-ui] client error", err);
      setError("AskBob couldn’t explain this quote. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <HbCard className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob explain</p>
        <h3 className="hb-heading-4 text-lg font-semibold">Explain this quote with AskBob</h3>
        <p className="text-sm text-slate-300">
          Generate a customer-friendly explanation you can edit or share.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <HbButton
          size="sm"
          variant="secondary"
          onClick={handleExplain}
          disabled={isLoading}
        >
          {isLoading ? "Generating explanation…" : "Explain with AskBob"}
        </HbButton>
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>
      {explanation && (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
            Customer-ready explanation
          </p>
          <p className="text-sm text-slate-100">{explanation}</p>
          {lineExplanations && lineExplanations.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                className="text-xs uppercase tracking-[0.3em] text-slate-400 underline-offset-4 hover:text-slate-200"
                onClick={() => setShowDetails((prev) => !prev)}
              >
                {showDetails ? "Hide line-by-line details" : "Show line-by-line details"}
              </button>
              {showDetails && (
                <ul className="space-y-2 text-sm text-slate-300">
                  {lineExplanations.map((line) => (
                    <li key={`line-${line.lineIndex}`}>
                      <strong className="text-slate-100">Line {line.lineIndex + 1}:</strong>{" "}
                      {line.explanation}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="text-xs text-slate-500">
            This explanation is AI-generated—review and edit before sharing with customers.
          </p>
        </div>
      )}
    </HbCard>
  );
}
