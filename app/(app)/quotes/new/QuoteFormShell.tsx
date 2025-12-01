"use client";

import { useState, type ChangeEvent } from "react";

import HbCard from "@/components/ui/hb-card";
import HbButton from "@/components/ui/hb-button";
import Link from "next/link";

import { createQuoteAction } from "./actions";
import { smartQuoteFromDescription } from "./quoteAiActions";

function clampNumberInput(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return 0;
  }
  return parsed < 0 ? 0 : parsed;
}

type QuoteFormShellProps = {
  jobIdPrefill: string;
  hasJobIdError: boolean;
  sourceFromQuery?: string;
  jobIdFromQuery?: string;
  descriptionFromQuery?: string;
};

type AiStatus = "idle" | "loading" | "error" | "disabled";

const idleHint =
  "Optional: describe the job in your own words and we’ll draft a quote you can edit before sending.";

type AiField = "subtotal" | "tax" | "total" | "lineItems" | "clientMessage";

const initialTouchedState: Record<AiField, boolean> = {
  subtotal: false,
  tax: false,
  total: false,
  lineItems: false,
  clientMessage: false,
};

export default function QuoteFormShell({
  jobIdPrefill,
  hasJobIdError,
  sourceFromQuery,
  jobIdFromQuery,
  descriptionFromQuery,
}: QuoteFormShellProps) {
  const [smartDescription, setSmartDescription] = useState(() => descriptionFromQuery ?? "");
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const jobContext = {
    jobId: jobIdFromQuery ?? null,
    source: sourceFromQuery ?? null,
  };
  const [smartStatusMessage, setSmartStatusMessage] = useState<string | null>(null);
  const [aiTouched, setAiTouched] = useState<Record<AiField, boolean>>(initialTouchedState);
  const [userTouched, setUserTouched] = useState<Record<AiField, boolean>>(initialTouchedState);
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);

  const [subtotal, setSubtotal] = useState("");
  const [tax, setTax] = useState("");
  const [lineItemsSummary, setLineItemsSummary] = useState("");
  const [clientMessage, setClientMessage] = useState("");
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [total, setTotal] = useState("");

  const markUserTouched = (field: AiField) => {
    setUserTouched((prev) => {
      if (prev[field]) return prev;
      return { ...prev, [field]: true };
    });
    setAiTouched((prev) => ({ ...prev, [field]: false }));
    setAiSuccessMessage(null);
  };

  const applyAiValue = (
    field: AiField,
    value: string,
    setter: (next: string) => void,
  ) => {
    if (userTouched[field]) return false;
    setter(value);
    setAiTouched((prev) => ({ ...prev, [field]: true }));
    return true;
  };

  const logComputedAmounts = (sub: number, taxVal: number, derived: number) => {
    console.log("[quotes/new] computed amounts", {
      subtotal: sub,
      tax: taxVal,
      total: derived,
    });
  };

  const recomputeDerivedTotal = (
    nextSubtotal?: number,
    nextTax?: number,
  ) => {
    if (userTouched.total) return;
    const baseSubtotal = nextSubtotal ?? clampNumberInput(subtotal);
    const baseTax = nextTax ?? clampNumberInput(tax);
    const derived = baseSubtotal + baseTax;
    setTotal(derived.toFixed(2));
    logComputedAmounts(baseSubtotal, baseTax, derived);
  };

  const handleSubtotalChange = (event: ChangeEvent<HTMLInputElement>) => {
    const normalized = clampNumberInput(event.target.value);
    markUserTouched("subtotal");
    const formatted = normalized.toFixed(2);
    setSubtotal(formatted);
    recomputeDerivedTotal(normalized, clampNumberInput(tax));
  };

  const handleTaxChange = (event: ChangeEvent<HTMLInputElement>) => {
    const normalized = clampNumberInput(event.target.value);
    markUserTouched("tax");
    setTax(normalized.toFixed(2));
    recomputeDerivedTotal(clampNumberInput(subtotal), normalized);
  };

  const handleTotalChange = (event: ChangeEvent<HTMLInputElement>) => {
    const normalized = clampNumberInput(event.target.value);
    markUserTouched("total");
    setTotal(normalized.toFixed(2));
    logComputedAmounts(clampNumberInput(subtotal), clampNumberInput(tax), normalized);
  };

  const handleFieldInput =
    (field: AiField, setter: (value: string) => void) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      markUserTouched(field);
      setter(event.target.value);
    };

  const handleSmartQuoteGenerate = async () => {
    console.log("[smart-quote-metrics]", {
      event: "smart_quote_click",
      hasDescription: smartDescription.trim().length > 0,
      descriptionLength: smartDescription.trim().length,
      jobId: jobContext.jobId,
      source: jobContext.source,
    });
    const trimmed = smartDescription.trim();
    if (!trimmed) {
      setAiStatus("error");
      setSmartStatusMessage("Describe the job first so we can generate a quote.");
      return;
    }

    setAiStatus("loading");
    setSmartStatusMessage(null);
    setDebugInfo(null);
    setAiSuccessMessage(null);

    try {
      const response = await smartQuoteFromDescription({ description: trimmed });
      console.log("[smart-quote] client-result", response);
      if (!response.ok) {
        if (response.error === "ai_disabled") {
          console.log("[smart-quote-metrics]", {
            event: "smart_quote_client_disabled",
            jobId: jobContext.jobId,
            source: jobContext.source,
            messageShort: response.message.slice(0, 120),
          });
          setDebugInfo(`Debug: ${response.error} – ${response.message}`);
          setAiStatus("disabled");
        setSmartStatusMessage(
          "Smart Quote Builder is currently disabled in this environment. You can still fill in the quote details manually.",
        );
          return;
        }
        console.log("[smart-quote-metrics]", {
          event: "smart_quote_client_error",
          jobId: jobContext.jobId,
          source: jobContext.source,
          errorCode: response.error,
          messageShort: response.message.slice(0, 120),
        });
        setDebugInfo(`Debug: ${response.error} – ${response.message}`);
        setAiStatus("error");
        setSmartStatusMessage(
          "We couldn’t generate a Smart Quote right now. You can try again or fill in the quote details manually.",
        );
        return;
      }

      setDebugInfo(null);
      const { lineItems, subtotal: aiSubtotal, tax: aiTax, clientMessage: aiClientMessage } =
        response.data;

      const appliedFields: AiField[] = [];

      const normalizedAiSubtotal = clampNumberInput(aiSubtotal);
      const normalizedAiTax = clampNumberInput(aiTax);

      if (applyAiValue("subtotal", normalizedAiSubtotal.toFixed(2), setSubtotal)) {
        appliedFields.push("subtotal");
      }
      if (applyAiValue("tax", normalizedAiTax.toFixed(2), setTax)) {
        appliedFields.push("tax");
      }
      const summary = lineItems
        .map(
          ({ label, quantity, unitPrice }) =>
            `${quantity} x ${label} ($${unitPrice.toFixed(2)})`,
        )
        .join("\n");
      if (summary && applyAiValue("lineItems", summary, setLineItemsSummary)) {
        appliedFields.push("lineItems");
      }

      if (aiClientMessage && applyAiValue("clientMessage", aiClientMessage, setClientMessage)) {
        appliedFields.push("clientMessage");
      }

      if (appliedFields.length > 0) {
        recomputeDerivedTotal(normalizedAiSubtotal, normalizedAiTax);
        console.log("[smart-quote] applied to form", {
          subtotal: normalizedAiSubtotal,
          tax: normalizedAiTax,
          total: normalizedAiSubtotal + normalizedAiTax,
        });
        console.log("[smart-quote-metrics]", {
          event: "smart_quote_applied",
          jobId: jobContext.jobId,
          source: jobContext.source,
          subtotal: normalizedAiSubtotal,
          tax: normalizedAiTax,
          total: normalizedAiSubtotal + normalizedAiTax,
          lineItemsCount: lineItems.length,
          userHadEditedAmounts:
            userTouched.subtotal || userTouched.tax || userTouched.total,
        });
        setAiSuccessMessage("Smart Quote applied. Review and adjust before sending.");
      } else {
        setAiSuccessMessage(null);
      }

      setAiStatus("idle");
      setSmartStatusMessage(null);
    } catch {
      setAiStatus("error");
        setSmartStatusMessage(
          "We couldn’t generate a Smart Quote right now. You can try again or fill in the quote details manually.",
        );
    }
  };

  const hasAiTouchedAnyField = Object.values(aiTouched).some(Boolean);

  const renderStatusText = () => {
    if (aiStatus === "loading") {
      return "Thinking…";
    }
    if ((aiStatus === "error" || aiStatus === "disabled") && smartStatusMessage) {
      return smartStatusMessage;
    }
    if (aiStatus === "idle") {
      return idleHint;
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <HbCard className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Smart Quote Builder</p>
          <h2 className="text-base font-semibold">Optional AI assistance</h2>
          <p className="hb-muted text-sm">
            Describe the job and we’ll suggest line items, taxes, and totals for you to review.
          </p>
          {jobIdFromQuery && sourceFromQuery === "job" && (
            <p className="text-[11px] text-slate-400">Using the description from this job.</p>
          )}
        </div>
        <div className="space-y-2">
          <label htmlFor="smart_description" className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Describe the job
          </label>
          <textarea
            id="smart_description"
            value={smartDescription}
            onChange={(event) => setSmartDescription(event.target.value)}
            rows={4}
            placeholder="Describe what the job involves, including room, materials, and rough scope."
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-2">
          <HbButton
            type="button"
            variant="secondary"
            disabled={aiStatus === "loading"}
            onClick={handleSmartQuoteGenerate}
          >
            {aiStatus === "loading" ? "Generating Smart Quote…" : "Generate Smart Quote"}
          </HbButton>
          <p
            className={`text-[11px] ${
              aiStatus === "error" ? "text-rose-300" : "text-slate-500"
            }`}
          >
            {renderStatusText()}
          </p>
          {aiSuccessMessage && aiStatus === "idle" && hasAiTouchedAnyField && (
            <p className="text-[11px] text-emerald-300">{aiSuccessMessage}</p>
          )}
          {debugInfo && (
            <p className="text-[10px] text-slate-500">{debugInfo}</p>
          )}
        </div>
        {aiStatus === "idle" && lineItemsSummary && (
          <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm">
            <p className="text-[11px] text-slate-500">Latest AI suggestion</p>
            <pre className="whitespace-pre-wrap text-xs text-slate-300">
              {lineItemsSummary}
            </pre>
          </div>
        )}
      </HbCard>

      <HbCard className="space-y-4">
        <form action={createQuoteAction} className="space-y-4">
          <input
            type="hidden"
            name="smart_quote_used"
            value={hasAiTouchedAnyField ? "true" : "false"}
          />
          {hasJobIdError && (
            <p className="text-xs text-rose-400">
              Please select or enter a job before creating a quote.
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label htmlFor="subtotal" className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Subtotal
              </label>
              <input
                id="subtotal"
                name="subtotal"
                type="number"
                step="0.01"
                value={subtotal}
                onChange={handleSubtotalChange}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="tax" className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Tax
              </label>
              <input
                id="tax"
                name="tax"
                type="number"
                step="0.01"
                value={tax}
                onChange={handleTaxChange}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="total" className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Total
              </label>
              <input
                id="total"
                name="total"
                type="number"
                step="0.01"
                value={total}
                onChange={handleTotalChange}
                placeholder="1200"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-slate-500">
                Leave blank if you still need to finalize pricing.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="job_id" className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Job id (required)
            </label>
            <input
              id="job_id"
              name="job_id"
              type="text"
              placeholder="Link to an existing job"
              defaultValue={jobIdPrefill || undefined}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              required
            />
            <p className="text-[11px] text-slate-500">
              Quotes must be attached to a job. Paste a job ID for now; later we’ll add a picker.
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="line_items_summary" className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Line items / scope breakdown (optional)
            </label>
            <textarea
              id="line_items_summary"
              name="line_items_summary"
              rows={3}
              value={lineItemsSummary}
              onChange={handleFieldInput("lineItems", setLineItemsSummary)}
              placeholder="AI suggestions appear here if you use the Smart Quote Builder."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="client_message_template"
              className="text-xs uppercase tracking-[0.3em] text-slate-500"
            >
              Message to customer (optional)
            </label>
            <textarea
              id="client_message_template"
              name="client_message_template"
              rows={3}
              value={clientMessage}
              onChange={handleFieldInput("clientMessage", setClientMessage)}
              placeholder="Thank you for considering HandyBob..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
            <HbButton type="submit">Create quote</HbButton>
            <Link href="/quotes" className="text-xs uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-100">
              Cancel
            </Link>
          </div>
        </form>
      </HbCard>
    </div>
  );
}
