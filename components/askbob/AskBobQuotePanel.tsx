"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { formatCurrency } from "@/utils/timeline/formatters";
import { runAskBobQuoteGenerateAction } from "@/app/(app)/askbob/quote-actions";
import { createQuoteFromAskBobAction } from "@/app/(app)/quotes/askbob-actions";
import { SmartQuoteSuggestion } from "@/lib/domain/quotes/askbob-adapter";
import { estimateSmartQuoteTotals } from "@/lib/domain/quotes/askbob-adapter";

type AskBobQuotePanelProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  onQuoteSuccess?: () => void;
  diagnosisSummaryForQuote?: string | null;
  materialsSummaryForQuote?: string | null;
  jobDescription?: string | null;
  jobTitle?: string | null;
  onQuoteApplied?: (quoteId: string, createdAt?: string | null) => void;
  onScrollToFollowup?: () => void;
  stepCompleted?: boolean;
  resetToken?: number;
  onQuoteReset?: () => void;
};

const DEFAULT_PROMPT = "Generate a standard quote for this job.";

type QuoteExtraDetailsInput = {
  jobTitle?: string | null;
  populatedJobDescription?: string | null;
  materialsSummary?: string | null;
  diagnosisSummary?: string | null;
  quoteNotes: string;
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
  return singleLine.length > 320 ? `${singleLine.slice(0, 320)}...` : singleLine;
}

function buildQuoteExtraDetails({
  jobTitle,
  populatedJobDescription,
  materialsSummary,
  diagnosisSummary,
  quoteNotes,
}: QuoteExtraDetailsInput): string | null {
  const parts: string[] = [];
  const normalizedJobTitle = jobTitle?.trim();
  if (normalizedJobTitle) {
    parts.push(`Job title: ${normalizedJobTitle}`);
  }
  const jobContext = buildJobDescriptionSnippet(populatedJobDescription);
  if (jobContext) {
    parts.push(`Job description: ${jobContext}`);
  }
  if (diagnosisSummary?.trim()) {
    parts.push(`Diagnosis summary from Step 1: ${diagnosisSummary.trim()}`);
  }
  if (materialsSummary?.trim()) {
    parts.push(`Materials summary from Step 2: ${materialsSummary.trim()}`);
  }
  if (quoteNotes.trim()) {
    parts.push(`Technician quote notes: ${quoteNotes.trim()}`);
  }
  if (!parts.length) {
    return null;
  }
  return parts.join("\n\n");
}

type TotalsBlockProps = {
  suggestion: SmartQuoteSuggestion;
};

function TotalsBlock({ suggestion }: TotalsBlockProps) {
  const totals = estimateSmartQuoteTotals(suggestion);
  const formatMaybe = (value?: number | null) =>
    typeof value === "number" ? formatCurrency(value) : "—";

  return (
    <div className="space-y-1 rounded-2xl bg-slate-900/60 p-3 text-sm text-slate-200">
      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Estimate summary</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">Estimated total (editable)</span>
        <span className="text-sm font-semibold text-slate-100">{formatMaybe(totals.total)}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Subtotal</span>
        <span>{formatMaybe(totals.subtotal)}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Tax</span>
        <span>{formatMaybe(totals.tax)}</span>
      </div>
    </div>
  );
}

export default function AskBobQuotePanel(props: AskBobQuotePanelProps) {
  const {
    jobId,
    onQuoteSuccess,
    diagnosisSummaryForQuote,
    materialsSummaryForQuote,
    jobDescription,
    jobTitle,
    onQuoteApplied,
    onScrollToFollowup,
    stepCompleted,
    resetToken,
    onQuoteReset,
  } = props;
  const router = useRouter();
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SmartQuoteSuggestion | null>(null);
  const [appliedQuoteId, setAppliedQuoteId] = useState<string | null>(null);
  useEffect(() => {
    if (resetToken === undefined) {
      return;
    }
    setSuggestion(null);
    setError(null);
    setApplyError(null);
    setAppliedQuoteId(null);
    setIsLoading(false);
    setIsApplying(false);
  }, [resetToken]);

  const normalizedJobTitle = jobTitle?.trim() ?? "";
  const normalizedJobDescription = jobDescription?.trim() ?? "";
  const normalizedDiagnosisSummary = diagnosisSummaryForQuote?.trim() ?? "";
  const normalizedMaterialsSummary = materialsSummaryForQuote?.trim() ?? "";
  const hasDiagnosisContextForQuote = Boolean(normalizedDiagnosisSummary);
  const hasMaterialsContextForQuote = Boolean(normalizedMaterialsSummary);
  const contextParts: string[] = [];
  if (normalizedJobTitle) {
    contextParts.push("job title");
  }
  if (normalizedJobDescription) {
    contextParts.push("job description");
  }
  if (hasDiagnosisContextForQuote) {
    contextParts.push("AskBob diagnosis");
  }
  if (hasMaterialsContextForQuote) {
    contextParts.push("AskBob materials checklist");
  }
  const scopeLines = suggestion?.scopeLines ?? [];
  const materials = suggestion?.materials ?? [];
  const notesText = suggestion?.notes?.trim() ?? "";
  const scopeLinesCount = scopeLines.length;
  const materialsLinesCount = materials.length;
  const hasAnyScope = scopeLinesCount > 0;
  const hasAnyMaterials = materialsLinesCount > 0;
  const hasNotes = Boolean(notesText);
  const hasAnyContent = hasAnyScope || hasAnyMaterials || hasNotes;
  const showThinHint = hasAnyScope && !hasAnyMaterials;
  const summaryLine = (() => {
    const parts: string[] = [];
    if (hasAnyScope) {
      parts.push(`${scopeLinesCount} scope line${scopeLinesCount === 1 ? "" : "s"}`);
    }
    if (hasAnyMaterials) {
      parts.push(`${materialsLinesCount} materials item${materialsLinesCount === 1 ? "" : "s"}`);
    }
    if (parts.length) {
      return `Includes ${parts.join(" and ")}.`;
    }
    if (hasNotes) {
      return "Includes notes from AskBob.";
    }
    return null;
  })();

  const hasActiveSuggestion = Boolean(suggestion || appliedQuoteId);
  const handleReset = () => {
    setSuggestion(null);
    setError(null);
    setApplyError(null);
    setAppliedQuoteId(null);
    setIsLoading(false);
    setIsApplying(false);
    onQuoteReset?.();
    if (typeof document === "undefined") {
      return;
    }
    const target = document.getElementById("askbob-quote");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("Please describe the quote you’d like AskBob to create.");
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const extraDetails = buildQuoteExtraDetails({
        populatedJobDescription: jobDescription,
        diagnosisSummary: normalizedDiagnosisSummary || null,
        materialsSummary: normalizedMaterialsSummary || null,
        quoteNotes: trimmedPrompt,
        jobTitle: normalizedJobTitle,
      });
      const result = await runAskBobQuoteGenerateAction({
        jobId,
        prompt: trimmedPrompt,
        extraDetails,
        jobTitle: normalizedJobTitle || undefined,
        diagnosisSummary: normalizedDiagnosisSummary || undefined,
        materialsSummary: normalizedMaterialsSummary || undefined,
        hasDiagnosisContext: hasDiagnosisContextForQuote,
        hasMaterialsContext: hasMaterialsContextForQuote,
        hasJobDescriptionContext: Boolean(normalizedJobDescription),
        hasMaterialsSummary: hasMaterialsContextForQuote,
        hasDiagnosisSummary: hasDiagnosisContextForQuote,
      });

      setSuggestion(result.suggestion);
      onQuoteSuccess?.();
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
        setAppliedQuoteId(result.quoteId);
        onQuoteApplied?.(result.quoteId, result.createdAt);
        onScrollToFollowup?.();
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
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <h2 className="hb-heading-3 text-xl font-semibold">Step 4 · Draft a quote</h2>
            {stepCompleted && (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold tracking-[0.3em] text-emerald-200">
                Done
              </span>
            )}
          </div>
          {hasActiveSuggestion && (
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
        <p className="text-sm text-slate-400">
          AskBob drafts a quote using the job title, description, materials checklist, and diagnosis summary.
          Treat the results as an estimate and confirm scope, hours, and rates on site before sharing them with a customer.
        </p>
        {normalizedJobTitle && (
          <p className="text-xs text-slate-500">Quote for {normalizedJobTitle}.</p>
        )}
        {contextParts.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Context used: {contextParts.join(", ")}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Context used: none yet. Provide the job details below so the quote reflects the actual scope.
          </p>
        )}
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
          <p className="text-xs text-slate-400">
            Note any updates to the job description, materials checklist, or customer expectations so AskBob can align the quote.
          </p>
        <div className="flex items-center gap-3">
          <HbButton onClick={handleGenerate} disabled={isLoading || isApplying} variant="secondary" size="sm">
            {isLoading ? "Generating AskBob quote…" : "Generate quote with AskBob"}
          </HbButton>
          <p className="text-xs text-slate-500">
            This suggestion remains editable and won’t be saved unless you copy it into an actual quote.
          </p>
        </div>
        {error && <p className="text-sm text-rose-300">{error}</p>}
      </div>
      {suggestion && (
        <div className="space-y-4 border-t border-slate-800 pt-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-100">Suggested quote from AskBob</p>
            {hasAnyContent ? (
              <>
                {summaryLine && <p className="text-xs text-muted-foreground">{summaryLine}</p>}
                {showThinHint && (
                  <p className="text-xs text-muted-foreground">Review and adjust these lines before sending to your customer.</p>
                )}
              </>
            ) : (
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>AskBob could not generate a detailed quote for this job yet.</p>
                <p>Try again with more specifics or build the quote manually.</p>
              </div>
            )}
          </div>
          {hasAnyContent && (
            <>
              {hasAnyScope && (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                    Scope
                  </p>
                  <div className="space-y-2">
                    {scopeLines.map((line, index) => (
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
                </div>
              )}
              {hasAnyMaterials && (
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Suggested materials</p>
                  <div className="space-y-1">
                    {materials.map((material, index) => (
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
              {hasNotes && (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Notes and caveats</p>
                  <p className="text-sm text-slate-300">{notesText}</p>
                </div>
              )}
              <TotalsBlock suggestion={suggestion} />
            </>
          )}
          {hasAnyContent && (
          <div className="space-y-2">
            <HbButton
              onClick={handleApplySuggestion}
              disabled={isApplying || isLoading || !hasAnyScope}
              variant="secondary"
              size="sm"
            >
              {isApplying ? "Applying AskBob suggestion…" : "Create quote from AskBob suggestion"}
            </HbButton>
            {!hasAnyScope ? (
              <p className="text-xs text-muted-foreground">
                AskBob did not return enough detail to create a quote. Try refining your question.
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                You can edit all lines and prices on the next screen before sharing with the customer.
              </p>
            )}
            {applyError && <p className="text-sm text-rose-300">{applyError}</p>}
            {appliedQuoteId && (
              <div className="space-y-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs text-emerald-200">
                <p>Quote created and saved for this job. Next: check AskBob’s follow-up guidance below.</p>
                <HbButton
                  variant="secondary"
                  size="sm"
                  className="w-fit"
                  onClick={() => router.push(`/quotes/${appliedQuoteId}`)}
                >
                  View quote details
                </HbButton>
              </div>
            )}
          </div>
        )}
      </div>
    )}
    </HbCard>
  );
}
