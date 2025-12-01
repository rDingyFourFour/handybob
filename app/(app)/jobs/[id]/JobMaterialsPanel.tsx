"use client";

import { MouseEvent, useState } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";

import {
  generateMaterialsForQuoteAction,
  MaterialsListActionResponse,
} from "@/app/(app)/quotes/[id]/materialsActions";

type MaterialsStatus = "idle" | "loading" | "success" | "error" | "disabled";

const DEFAULT_ERROR_MESSAGE = "We couldn’t generate a materials list. Please try again.";

type JobMaterialsPanelProps = {
  jobId: string;
  jobTitle: string;
  jobDescription?: string | null;
  materialsQuoteId?: string | null;
  materialsQuoteDescription?: string | null;
};

export default function JobMaterialsPanel({
  jobId,
  jobTitle,
  jobDescription,
  materialsQuoteId,
  materialsQuoteDescription,
}: JobMaterialsPanelProps) {
  const hasQuote = Boolean(materialsQuoteId);
  const [status, setStatus] = useState<MaterialsStatus>("idle");
  const [materials, setMaterials] = useState<MaterialsListActionResponse["data"] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  if (!hasQuote) {
    return (
      <HbCard className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Materials list (AI)</p>
          <p className="text-sm text-slate-400">Add a quote to generate a materials checklist for this job.</p>
        </div>
      </HbCard>
    );
  }

  const buildDescription = () => {
    if (materialsQuoteDescription) {
      return `Job: ${jobTitle}. Quote details: ${materialsQuoteDescription}`.trim();
    }
    if (jobDescription?.trim()) {
      return `Job: ${jobTitle}. Description: ${jobDescription.trim()}`;
    }
    return `Job: ${jobTitle}. Generate a materials checklist for this job.`;
  };

  const handleGenerate = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (status === "loading" || !materialsQuoteId) {
      return;
    }
    const descriptionForAi = buildDescription();
    const descriptionSnippet = descriptionForAi.slice(0, 80);
    console.log("[materials-ui-job] generate requested", {
      jobId,
      materialsQuoteId,
      descriptionSnippet,
    });
    setStatus("loading");
    setMaterials(null);
    setErrorMessage(null);
    try {
      const response = await generateMaterialsForQuoteAction({
        quoteId: materialsQuoteId,
        description: descriptionForAi || null,
      });
      if (!response.ok) {
        const message = response.message ?? DEFAULT_ERROR_MESSAGE;
        const nextStatus = response.error === "ai_disabled" ? "disabled" : "error";
        setStatus(nextStatus);
        setErrorMessage(message);
        console.log("[materials-ui-job] materials error", {
          jobId,
          materialsQuoteId,
          status: nextStatus,
          message,
        });
        return;
      }
      const payload = response.data ?? { items: [] };
      setMaterials(payload);
      setStatus("success");
      setErrorMessage(null);
      console.log("[materials-ui-job] materials success", {
        jobId,
        materialsQuoteId,
        itemCount: payload.items.length,
      });
      if (payload.items.length === 0) {
        console.log("[materials-ui-job] materials empty", {
          jobId,
          materialsQuoteId,
          itemCount: 0,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE;
      setStatus("error");
      setErrorMessage(message);
      console.log("[materials-ui-job] materials error", {
        jobId,
        materialsQuoteId,
        status: "error",
        message,
      });
    }
  };

  const buttonLabel = status === "loading" ? "Generating…" : "Generate materials list";
  const items = materials?.items ?? [];

  return (
    <HbCard className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Materials list (AI)</p>
          <p className="text-sm text-slate-300">
            Optional: generate a materials checklist for this job based on its quote.
          </p>
        </div>
        <HbButton
          size="sm"
          variant="secondary"
          disabled={status === "loading"}
          onClick={handleGenerate}
        >
          {buttonLabel}
        </HbButton>
      </div>
      {status === "success" && items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`} className="space-y-1">
              <p className="text-sm font-semibold text-slate-100">{item.label}</p>
              {(item.quantity || item.notes) && (
                <p className="text-xs text-slate-400">
                  {[item.quantity, item.notes].filter(Boolean).join(" • ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : status === "success" ? (
        <p className="text-sm text-slate-400">
          No materials were suggested for this job. Try refining the quote or make your own checklist.
        </p>
      ) : status === "error" ? (
        <p className="text-sm text-rose-400">
          {errorMessage ?? DEFAULT_ERROR_MESSAGE}
        </p>
      ) : (
        <p className="text-sm text-slate-400">No materials generated yet.</p>
      )}
    </HbCard>
  );
}
