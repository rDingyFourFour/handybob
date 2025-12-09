"use client";

import { FormEvent, useState, useTransition } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import AskBobResponseCard from "./AskBobResponseCard";
import type { AskBobResponseDTO } from "@/lib/domain/askbob/types";
import { submitAskBobQueryAction } from "@/app/(app)/askbob/actions";

type AskBobFormProps = {
  workspaceId: string;
  jobId?: string | null;
  customerId?: string | null;
  quoteId?: string | null;
  onSuccess?: () => void;
  jobDescription?: string | null;
};

const MIN_PROMPT_LENGTH = 10;

export default function AskBobForm({
  workspaceId,
  jobId,
  customerId,
  quoteId,
  onSuccess,
  jobDescription,
}: AskBobFormProps) {
  const trimmedJobDescription = jobDescription?.trim() ?? "";
  const [prompt, setPrompt] = useState(() => trimmedJobDescription);
  const [response, setResponse] = useState<AskBobResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!workspaceId) {
      setError("Workspace is not available. Please select a workspace first.");
      return;
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < MIN_PROMPT_LENGTH) {
      setError("Please describe the issue with a few more details.");
      return;
    }

    console.log("[askbob-form-submit]", {
      workspaceId,
      hasJobId: Boolean(jobId),
      hasCustomerId: Boolean(customerId),
      hasQuoteId: Boolean(quoteId),
      promptLength: trimmedPrompt.length,
    });

    startTransition(() => {
      setResponse(null);
      void submitAskBobQueryAction({
        prompt: trimmedPrompt,
        workspaceId,
        jobId: jobId ?? undefined,
        customerId: customerId ?? undefined,
        quoteId: quoteId ?? undefined,
      })
        .then((dto) => {
          setResponse(dto);
          setError(null);
          onSuccess?.();
        })
        .catch((submitError) => {
          console.error("[AskBobForm] Failed to submit query:", submitError);
          setResponse(null);
          setError("AskBob could not process your request. Please try again.");
        });
    });
  };

  const buttonLabel = isPending ? "Thinking..." : "Ask Bob";

  return (
    <div className="space-y-6">
      <HbCard className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="askbob-prompt" className="text-sm font-semibold text-slate-100">
              Describe the problem
            </label>
        <textarea
          id="askbob-prompt"
          name="prompt"
          className="w-full min-h-[140px] rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
          placeholder="Include symptoms, location, materials (copper, PEX, PVC), and any constraints around time, budget, or access."
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        {trimmedJobDescription && (
          <p className="text-xs text-slate-400">
            Using the job description as a starting point. You can edit it before running AskBob.
          </p>
        )}
            <p className="text-xs text-slate-400">
              The more detail you provide, the better AskBob can suggest steps, materials, and cautions.
            </p>
          </div>

          {error && (
            <p className="text-sm text-rose-400" role="status">
              {error}
            </p>
          )}

          <div>
            <HbButton type="submit" variant="primary" disabled={isPending}>
              {buttonLabel}
            </HbButton>
          </div>
        </form>
      </HbCard>

      {response && (
        <AskBobResponseCard
          response={response}
          workspaceId={workspaceId}
          jobId={jobId ?? undefined}
          customerId={customerId ?? undefined}
        />
      )}
    </div>
  );
}
