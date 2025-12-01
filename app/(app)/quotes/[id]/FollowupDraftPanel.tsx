"use client";

import { FormEventHandler, useState, useTransition } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import {
  GenerateFollowupForQuoteActionInput,
  generateFollowupForQuoteAction,
} from "@/app/(app)/quotes/[id]/followupActions";
import { SmartFollowupResult } from "@/app/(app)/quotes/[id]/followupAiActions";

type FollowupDraftPanelProps = {
  quoteId: string;
  description: string;
  jobId?: string | null;
  workspaceId?: string | null;
  status?: string | null;
  totalAmount?: number | null;
  customerName?: string | null;
  daysSinceQuote?: number | null;
  createMessageAction: (formData: FormData) => Promise<unknown>;
};

type FollowupFormEvent = FormEventHandler<HTMLFormElement>;

export default function FollowupDraftPanel({
  quoteId,
  description,
  jobId,
  workspaceId,
  status,
  totalAmount,
  customerName,
  daysSinceQuote,
  createMessageAction,
}: FollowupDraftPanelProps) {
  const [result, setResult] = useState<SmartFollowupResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasEverFetched, setHasEverFetched] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleGenerate = () => {
    const trimmedDescription = description?.trim() ?? "";
    if (!trimmedDescription) {
      setErrorMessage("Add or update the description before generating a follow-up.");
      return;
    }

    setErrorMessage(null);
    void startTransition(async () => {
      try {
        const payload: GenerateFollowupForQuoteActionInput = {
          quoteId,
          description: trimmedDescription,
          jobId,
          workspaceId,
          status,
          totalAmount,
          customerName,
          daysSinceQuote,
        };
        const response = await generateFollowupForQuoteAction(payload);
        if (response.ok) {
          setResult(response.data);
          setErrorMessage(null);
          setHasEverFetched(true);
        } else {
          setErrorMessage(response.message);
        }
      } catch (error) {
        console.error("[followup-panel] generateFollowupForQuoteAction failed", error);
        setErrorMessage("We couldn’t generate a follow-up message. Please try again.");
      }
    });
  };

  const hasContent = Boolean(result?.subject || result?.body);
  const formatChannel = (value: string) =>
    `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`;

  const handleCopy = async () => {
    if (!hasContent) {
      return;
    }
    const subjectText = result?.subject ?? "";
    const bodyText = result?.body ?? "";
    const payload = `Subject: ${subjectText}\n\n${bodyText}`;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(payload);
      } catch (error) {
        console.error("[followup-panel] clipboard.writeText failed", error);
      }
    }
    console.log("[followup-metrics]", {
      event: "followup_used",
      action: "copy_to_clipboard",
      quoteId,
      jobId: jobId ?? null,
    });
  };

  const channelSuggestionLabel =
    result?.channelSuggestion && hasEverFetched ? (
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
        Suggested channel: {formatChannel(result.channelSuggestion)}
      </p>
    ) : null;

  const handleFormSubmit: FollowupFormEvent = (event) => {
    if (!hasContent) {
      event.preventDefault();
    }
  };

  return (
    <HbCard className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-slate-100">Suggested follow-up message</h3>
        <p className="text-xs text-slate-400">
          AI-generated. Please review and edit before sending.
        </p>
        {channelSuggestionLabel}
      </div>

      <div className="flex flex-wrap gap-3">
        <HbButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleGenerate}
          disabled={isPending}
        >
          {isPending ? "Generating…" : "Generate follow-up message"}
        </HbButton>
        <HbButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void handleCopy()}
          disabled={!hasContent}
        >
          Copy follow-up text
        </HbButton>
      </div>

      {hasContent && createMessageAction && (
        <form action={createMessageAction} onSubmit={handleFormSubmit} className="space-y-2">
          <input type="hidden" name="quote_id" value={quoteId} />
          {jobId && <input type="hidden" name="job_id" value={jobId} />}
          {workspaceId && <input type="hidden" name="workspace_id" value={workspaceId} />}
          <input type="hidden" name="followup_subject" value={result?.subject ?? ""} />
          <input type="hidden" name="followup_body" value={result?.body ?? ""} />
          <div className="flex flex-wrap gap-3">
            <HbButton
              type="submit"
              variant="secondary"
              size="sm"
              disabled={!hasContent || isPending}
            >
              Save as draft message
            </HbButton>
          </div>
          <p className="text-xs text-slate-400">
            We’ll save this as a draft on your Messages page.
          </p>
        </form>
      )}

      {errorMessage && <p className="text-sm text-rose-400">{errorMessage}</p>}

      {hasEverFetched && result && (
        <div className="space-y-3 rounded-lg border border-slate-800/60 bg-slate-950/40 p-3 text-sm text-slate-100">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Subject</p>
            <p className="font-mono text-sm text-slate-50">{result.subject}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Message</p>
            <p className="whitespace-pre-line break-words text-sm text-slate-200">{result.body}</p>
          </div>
        </div>
      )}
    </HbCard>
  );
}
