"use client";

import { MouseEvent, useState } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";

import {
  generateMaterialsForQuoteAction,
  MaterialsListActionResponse,
} from "./materialsActions";

type QuoteLineItem = {
  description?: string | null;
  amount?: number | null;
};

type QuoteMaterialsPanelProps = {
  quoteId: string;
  workspaceId?: string | null;
  description?: string | null;
  lineItems?: QuoteLineItem[] | null;
  jobId?: string | null;
};

type MaterialsStatus = "idle" | "loading" | "success" | "error" | "disabled";

const DEFAULT_ERROR_MESSAGE = "We couldn’t generate a materials list. Please try again.";

export default function QuoteMaterialsPanel({
  quoteId,
  workspaceId,
  description,
  lineItems,
  jobId,
}: QuoteMaterialsPanelProps) {
  const workspaceDisabled = !workspaceId?.trim();
  const [status, setStatus] = useState<MaterialsStatus>(
    workspaceDisabled ? "disabled" : "idle"
  );
  const [materials, setMaterials] = useState<MaterialsListActionResponse["data"] | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const trimmedDescription = description?.trim() ?? "";

  const handleGenerate = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (workspaceDisabled || status === "loading") {
      return;
    }

    console.log("[materials-ui] generate requested", {
      quoteId,
      workspaceId,
    });

    setStatus("loading");
    setMaterials(null);
    setErrorMessage(null);

    try {
      const response = await generateMaterialsForQuoteAction({
        quoteId,
        workspaceId: workspaceId ?? undefined,
        description: trimmedDescription || null,
        lineItems:
          Array.isArray(lineItems) && lineItems.length ? lineItems : undefined,
        jobId,
      });

      if (!response.ok) {
        const message = response.message ?? DEFAULT_ERROR_MESSAGE;
        const nextStatus = response.error === "ai_disabled" ? "disabled" : "error";
        setStatus(nextStatus);
        setErrorMessage(message);
        console.log("[materials-ui] materials error", {
          quoteId,
          workspaceId,
          status: nextStatus,
          message,
        });
        return;
      }

      const payload = response.data ?? { items: [] };
      setMaterials(payload);
      setStatus("success");
      setErrorMessage(null);
      console.log("[materials-ui] materials success", {
        quoteId,
        workspaceId,
        itemCount: payload.items.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE;
      setStatus("error");
      setErrorMessage(message);
      console.log("[materials-ui] materials error", {
        quoteId,
        workspaceId,
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
            Optional: generate a checklist of materials to bring for this quote.
          </p>
        </div>
        <HbButton
          size="sm"
          variant="secondary"
          disabled={workspaceDisabled || status === "loading"}
          onClick={handleGenerate}
        >
          {buttonLabel}
        </HbButton>
      </div>
      {workspaceDisabled ? (
        <p className="text-sm text-slate-500">
          Materials suggestions are disabled for this workspace.
        </p>
      ) : status === "success" && items.length > 0 ? (
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
        <p className="text-sm text-slate-400">No materials suggested for this quote.</p>
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
