"use client";

import { useState } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import type { AskBobMaterialExplanation } from "@/lib/domain/askbob/types";
import { explainMaterialsQuoteWithAskBobAction } from "@/app/(app)/quotes/askbob-materials-explain-actions";

type MaterialsQuoteExplainPanelProps = {
  quoteId: string;
};

export default function MaterialsQuoteExplainPanel({
  quoteId,
}: MaterialsQuoteExplainPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [itemExplanations, setItemExplanations] = useState<AskBobMaterialExplanation[] | null>(
    null
  );
  const [showDetails, setShowDetails] = useState(false);
  const [hasNoMaterials, setHasNoMaterials] = useState(false);

  const handleExplain = async () => {
    setError(null);
    setHasNoMaterials(false);
    setIsLoading(true);
    try {
      const result = await explainMaterialsQuoteWithAskBobAction({
        quoteId: quoteId.trim(),
      });
      if (!result.ok) {
        if (result.code === "no_materials_for_quote") {
          setHasNoMaterials(true);
          return;
        }
        setError(result.error ?? "AskBob couldn’t explain these materials. Please try again.");
        return;
      }
      setExplanation(result.explanation);
      setItemExplanations(result.itemExplanations ?? []);
    } catch (err) {
      console.error("[askbob-materials-explain-ui] client error", err);
      setError("AskBob couldn’t explain these materials. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const itemDetails = itemExplanations ?? [];
  const hasItemDetails = itemDetails.length > 0;

  return (
    <HbCard className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob explain</p>
        <h3 className="hb-heading-4 text-lg font-semibold">Explain materials with AskBob</h3>
        <p className="text-sm text-slate-300">
          Generate a concise, plain-language explanation of what these materials cover, highlight key inclusions or exclusions, and remind the homeowner that pricing is an estimate.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <HbButton
          size="sm"
          variant="secondary"
          onClick={handleExplain}
          disabled={isLoading}
        >
          {isLoading ? "Generating explanation…" : "Explain materials with AskBob"}
        </HbButton>
        {hasNoMaterials && (
          <p className="text-sm text-slate-400">
            There’s no materials list for this quote yet. Generate materials first, then AskBob can explain them.
          </p>
        )}
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>
      {explanation && (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
            Customer-ready materials explanation
          </p>
          <p className="text-sm text-slate-100">{explanation}</p>
          {hasItemDetails && (
            <div className="space-y-2">
              <button
                type="button"
                className="text-xs uppercase tracking-[0.3em] text-slate-400 underline-offset-4 hover:text-slate-200"
                onClick={() => setShowDetails((prev) => !prev)}
              >
                {showDetails ? "Hide item-by-item details" : "Show item-by-item details"}
              </button>
              {showDetails && (
                <ul className="space-y-2 text-sm text-slate-300">
                  {itemDetails.map((item) => (
                    <li key={`item-${item.itemIndex}`} className="space-y-1">
                      <p>
                        <strong className="text-slate-100">
                          Item {item.itemIndex + 1} explanation:
                        </strong>{" "}
                        {item.explanation}
                      </p>
                      {item.inclusions && item.inclusions.length > 0 && (
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                          Includes: {item.inclusions.join(", ")}
                        </p>
                      )}
                      {item.exclusions && item.exclusions.length > 0 && (
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                          Excludes: {item.exclusions.join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="text-xs text-slate-500">
            This explanation is AI-generated—review and revise it before sending it to a customer.
          </p>
        </div>
      )}
    </HbCard>
  );
}
