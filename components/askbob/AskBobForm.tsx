"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
  jobTitle?: string | null;
  onResponse?: (response: AskBobResponseDTO) => void;
  initialPrompt?: string;
  askBobOrigin?: string | null;
};

const MIN_PROMPT_LENGTH = 10;

function buildJobDescriptionSnippet(description?: string | null, limit = 320): string | null {
  if (!description) {
    return null;
  }
  const trimmed = description.trim();
  if (!trimmed) {
    return null;
  }
  const singleLine = trimmed.replace(/\s+/g, " ");
  return singleLine.length > limit ? `${singleLine.slice(0, limit)}...` : singleLine;
}

type DiagnoseExtraDetailsArgs = {
  jobTitle?: string;
  jobDescription?: string | null;
  technicianNotes?: string;
};

function buildDiagnoseExtraDetails({
  jobTitle,
  jobDescription,
  technicianNotes,
}: DiagnoseExtraDetailsArgs): string | null {
  const parts: string[] = [];

  if (jobTitle) {
    parts.push(`Job title: ${jobTitle}`);
  }

  const jobContext = buildJobDescriptionSnippet(jobDescription);
  if (jobContext) {
    parts.push(`Job description: ${jobContext}`);
  }

  if (technicianNotes) {
    parts.push(`Technician notes: ${technicianNotes}`);
  }

  if (!parts.length) {
    return null;
  }

  return parts.join("\n\n");
}

export default function AskBobForm({
  workspaceId,
  jobId,
  customerId,
  quoteId,
  onSuccess,
  jobDescription,
  jobTitle,
  onResponse,
  initialPrompt,
  askBobOrigin,
}: AskBobFormProps) {
  const trimmedJobDescription = jobDescription?.trim() ?? "";
  const hasPromptSeed = Boolean(trimmedJobDescription);
  const initialPromptValue = initialPrompt?.trim() ?? "";
  const [prompt, setPrompt] = useState(() => initialPromptValue || trimmedJobDescription);
  const [response, setResponse] = useState<AskBobResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const effectiveJobTitle = jobTitle?.trim() ?? "";
  const router = useRouter();
  const isStandaloneAskBob = !jobId;

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

    const extraDetailsPayload = buildDiagnoseExtraDetails({
      jobTitle: effectiveJobTitle || undefined,
      jobDescription,
      technicianNotes: trimmedPrompt,
    });

    console.log("[askbob-form-submit]", {
      workspaceId,
      hasJobId: Boolean(jobId),
      hasCustomerId: Boolean(customerId),
      hasQuoteId: Boolean(quoteId),
      hasJobTitle: Boolean(effectiveJobTitle),
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
        jobTitle: effectiveJobTitle || undefined,
        extraDetails: extraDetailsPayload ?? undefined,
      })
        .then((dto) => {
          setResponse(dto);
          setError(null);
          onResponse?.(dto);
          onSuccess?.();
        })
        .catch((submitError) => {
          console.error("[AskBobForm] Failed to submit query:", submitError);
          setResponse(null);
          setError("AskBob could not process your request. Please try again.");
        });
    });
  };

  const hasJobContext = Boolean(jobId || trimmedJobDescription);
  const buttonLabel = isPending
    ? "Thinking..."
    : hasJobContext
    ? "Diagnose this job with AskBob"
    : "Ask Bob for help";

  const trimmedPrompt = prompt.trim();
  const sanitizedPrompt = trimmedPrompt.replace(/\s+/g, " ");
  const responseSummary = useMemo(() => {
    if (!response) {
      return null;
    }
    for (const section of response.sections) {
      for (const item of section.items) {
        const normalized = item?.trim();
        if (normalized) {
          return normalized;
        }
      }
    }
    return null;
  }, [response]);
  const fallbackTitle = sanitizedPrompt
    ? `AskBob job: ${sanitizedPrompt.slice(0, 70)}${sanitizedPrompt.length > 70 ? "…" : ""}`
    : "";
  const suggestedTitle = responseSummary?.length
    ? responseSummary.length > 80
      ? `${responseSummary.slice(0, 77)}…`
      : responseSummary
    : fallbackTitle;
  const stepsSection = response?.sections.find((section) => section.type === "steps");
  const stepItems = stepsSection?.items ?? [];
  const stepTextList = stepItems
    .map((step) => step.trim())
    .filter((step) => Boolean(step))
    .slice(0, 3)
    .map((step, index) => `${index + 1}. ${step}`);
  const descriptionParts: string[] = [];
  if (trimmedPrompt) {
    descriptionParts.push(`Original request: ${trimmedPrompt}`);
  }
  if (responseSummary) {
    descriptionParts.push(`AskBob summary: ${responseSummary}`);
  }
  if (stepTextList.length) {
    descriptionParts.push(`Key steps:\n${stepTextList.join("\n")}`);
  }
  const suggestedDescription = descriptionParts.join("\n\n").trim();
  const showCreateJobCTA =
    isStandaloneAskBob && Boolean(suggestedTitle || suggestedDescription);
  const showAskBobOriginHint = askBobOrigin === "jobs-new";
  const handleCreateJobFromAskBob = () => {
    const params = new URLSearchParams();
    if (suggestedTitle) {
      params.set("title", suggestedTitle);
    }
    if (suggestedDescription) {
      params.set("description", suggestedDescription);
    }
    params.set("origin", "askbob");
    console.log("[askbob-create-job-click]", {
      workspaceId,
      promptLength: trimmedPrompt.length,
      hasSummary: Boolean(responseSummary),
      titleLength: suggestedTitle.length,
      descriptionLength: suggestedDescription.length,
    });
    router.push(`/jobs/new?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      <HbCard className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="askbob-prompt" className="text-sm font-semibold text-slate-100">
              Describe the problem
            </label>
            {showAskBobOriginHint && (
              <p className="text-xs text-slate-400">
                This AskBob session was opened from the New Job page. You can create a job from the result when you’re ready.
              </p>
            )}
            <textarea
              id="askbob-prompt"
              name="prompt"
              className="w-full min-h-[140px] rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
              placeholder="Include symptoms, location, materials (copper, PEX, PVC), and any constraints around time, budget, or access."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
            {hasPromptSeed ? (
              <p className="text-xs text-slate-400">
                This field starts with the job description. Edit or expand it with what you’re seeing on-site before AskBob suggests a step-by-step plan.
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                Describe the problem in your own words—symptoms, constraints, notes from the customer—so AskBob can build a step-by-step plan.
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
      {response && showCreateJobCTA && (
        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
          <p className="text-sm text-slate-100">Happy with this AskBob result? Turn it into a new job.</p>
          <HbButton type="button" variant="primary" onClick={handleCreateJobFromAskBob}>
            Create job from this AskBob result
          </HbButton>
        </div>
      )}
    </div>
  );
}
