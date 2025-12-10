"use client";

import { useState, type FormEvent } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { generateAskBobJobIntakeAction } from "@/app/(app)/askbob/job-intake-action";

type JobNewAskBobHelperProps = {
  workspaceId: string;
  onApplySuggestion: (payload: { title: string; description: string }) => void;
};

type Status = "idle" | "loading" | "success" | "error";

export default function JobNewAskBobHelper({ workspaceId, onApplySuggestion }: JobNewAskBobHelperProps) {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasAppliedSuggestion, setHasAppliedSuggestion] = useState(false);

  const isSubmitting = status === "loading";
  const trimmedPrompt = prompt.trim();

  const helperMessage =
    status === "loading"
      ? "Generating AskBob’s suggestions…"
      : status === "error"
      ? errorMessage ?? "AskBob could not generate a suggestion."
      : "AskBob suggests a job title and description that you can edit before saving.";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedPrompt) {
      setStatus("error");
      setErrorMessage("Please describe the job first.");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);

    try {
      const result = await generateAskBobJobIntakeAction({
        workspaceId,
        prompt: trimmedPrompt,
      });

      const suggestedTitle = result?.suggestedTitle?.trim() ?? "";
      const suggestedDescription = result?.suggestedDescription?.trim() ?? "";
      const finalDescription = suggestedDescription || trimmedPrompt;

      onApplySuggestion({
        title: suggestedTitle,
        description: finalDescription,
      });

      setHasAppliedSuggestion(true);
      setStatus("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "AskBob could not generate a suggestion.";
      setStatus("error");
      setErrorMessage(message);
      console.error("[jobs-new-askbob]", { error });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <HbCard className="space-y-3 border border-slate-800 bg-slate-950/60 px-4 py-4 text-sm text-slate-200">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob job intake</p>
        <h2 className="hb-heading-3 text-xl font-semibold">
          Step 1 · Describe the job with AskBob
        </h2>
        <p className="text-sm text-slate-400">
          This is the first step of job creation. AskBob suggests a title and description that you can tweak before saving.
        </p>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Customer wants their back porch repaired and painted before the summer event."
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          rows={4}
        />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="w-full text-[11px] text-slate-400 md:pr-3">
            <p className={status === "error" ? "text-rose-300" : "text-slate-400"}>{helperMessage}</p>
            {hasAppliedSuggestion && (
              <p className="text-[11px] text-emerald-300">
                Title and description have been prefilled; you can edit them before saving.
              </p>
            )}
          </div>
          <HbButton
            type="submit"
            size="sm"
            variant="secondary"
            disabled={isSubmitting || !trimmedPrompt}
            className="w-full md:w-auto"
          >
            {isSubmitting ? "Suggesting…" : "Suggest title & description"}
          </HbButton>
        </div>
      </HbCard>
    </form>
  );
}
