"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import type { AskBobJobFollowupResult } from "@/lib/domain/askbob/types";
import { runAskBobJobFollowupAction } from "@/app/(app)/askbob/followup-actions";
import { draftAskBobJobFollowupMessageAction } from "@/app/(app)/askbob/followup-message-draft-actions";

type JobAskBobFollowupPanelProps = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  jobTitle?: string | null;
  jobDescription?: string | null;
  diagnosisSummaryForFollowup?: string | null;
  materialsSummaryForFollowup?: string | null;
  hasQuoteContextForFollowup?: boolean;
};

export default function JobAskBobFollowupPanel({
  workspaceId,
  jobId,
  customerId,
  jobTitle,
  jobDescription,
  diagnosisSummaryForFollowup,
  materialsSummaryForFollowup,
  hasQuoteContextForFollowup,
}: JobAskBobFollowupPanelProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AskBobJobFollowupResult | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const normalizedJobTitle = jobTitle?.trim() ?? "";
  const normalizedJobDescription = jobDescription?.trim() ?? "";
  const normalizedDiagnosisSummary = diagnosisSummaryForFollowup?.trim() ?? "";
  const normalizedMaterialsSummary = materialsSummaryForFollowup?.trim() ?? "";
  const hasDiagnosisContext = Boolean(normalizedDiagnosisSummary);
  const hasMaterialsContext = Boolean(normalizedMaterialsSummary);
  const hasQuoteContext = Boolean(hasQuoteContextForFollowup);
  const contextParts: string[] = [];
  if (normalizedJobTitle) {
    contextParts.push("job title");
  }
  if (normalizedJobDescription) {
    contextParts.push("job description");
  }
  if (hasDiagnosisContext) {
    contextParts.push("AskBob diagnosis");
  }
  if (hasMaterialsContext) {
    contextParts.push("AskBob materials checklist");
  }
  if (hasQuoteContext) {
    contextParts.push("AskBob quote");
  }
  const contextUsedText =
    contextParts.length > 0
      ? `Context used: ${contextParts.join(", ")}`
      : "Context used: none yet. AskBob will use job and follow-up details from this page.";

  const handleRequest = async () => {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const response = await runAskBobJobFollowupAction({
        workspaceId,
        jobId,
        extraDetails: null,
        jobTitle: normalizedJobTitle || undefined,
        jobDescription: normalizedJobDescription || undefined,
        diagnosisSummary: normalizedDiagnosisSummary || undefined,
        materialsSummary: normalizedMaterialsSummary || undefined,
        hasQuoteContextForFollowup: hasQuoteContext,
      });
      if (!response.ok) {
        setErrorMessage("AskBob couldn’t generate a follow-up suggestion right now. Please try again.");
        return;
      }
      setResult(response.followup);
    } catch (error) {
      console.error("[askbob-job-followup-ui] client error", error);
      setErrorMessage("AskBob couldn’t generate a follow-up suggestion right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    console.log("[askbob-job-followup-ui-entry]", {
      workspaceId,
      jobId,
      hasCustomerId: Boolean(customerId),
      hasJobTitle: Boolean(normalizedJobTitle),
    });
    setDraftError(null);
  }, [workspaceId, jobId, customerId, normalizedJobTitle]);

  useEffect(() => {
    setDraftError(null);
  }, [result]);

  const followup = result;
  const showMessageCTAs = Boolean(followup?.shouldSendMessage && customerId);
  const followupDraftHint =
    showMessageCTAs && followup
      ? "AskBob will prefill an editable follow-up message based on this guidance."
      : null;
  const followupComposerHref = showMessageCTAs
    ? `/messages?${new URLSearchParams({
        compose: "1",
        customerId: customerId ?? "",
        jobId,
        origin: "askbob-followup",
      }).toString()}`
    : undefined;
  const handleComposeClick = () => {
    console.log("[askbob-job-followup-open-composer]", {
      workspaceId,
      jobId,
      customerId,
      shouldSendMessage: followup?.shouldSendMessage,
      suggestedChannel: followup?.suggestedChannel,
      hasJobTitle: Boolean(normalizedJobTitle),
    });
  };

  const handleDraftClick = async () => {
    if (!customerId || !jobId || !followup) {
      return;
    }

    console.log("[askbob-job-followup-draft-click]", {
      workspaceId,
      jobId,
      customerId,
      shouldSendMessage: followup.shouldSendMessage,
      suggestedChannel: followup.suggestedChannel,
      hasJobTitle: Boolean(normalizedJobTitle),
    });

    setDraftError(null);
    setIsDrafting(true);

    try {
      const response = await draftAskBobJobFollowupMessageAction({
        workspaceId,
        jobId,
        extraDetails: null,
        jobTitle: normalizedJobTitle || undefined,
      });

      if (!response.ok || !response.body?.trim()) {
        setDraftError("AskBob couldn’t draft a follow-up message right now. Try again or compose manually.");
        return;
      }

      const params = new URLSearchParams({
        compose: "1",
        customerId,
        jobId,
        origin: "askbob-followup",
      });
      const draftBody = response.body.trim();
      params.set("draftBody", draftBody);

      router.push(`/messages?${params.toString()}`);
    } catch (error) {
      console.error("[askbob-job-followup-draft-click] error", error);
      setDraftError("AskBob couldn’t draft a follow-up message right now. Try again or compose manually.");
    } finally {
      setIsDrafting(false);
    }
  };

  const signalText = result
    ? `Send message: ${result.shouldSendMessage ? "yes" : "no"} · Schedule visit: ${
        result.shouldScheduleVisit ? "yes" : "no"
      } · Call: ${result.shouldCall ? "yes" : "no"} · Wait: ${
        result.shouldWait ? "yes" : "no"
      }`
    : null;

  return (
    <HbCard className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob</p>
        <h2 className="hb-heading-3 text-xl font-semibold">Step 4 · Plan the follow-up</h2>
        <p className="text-sm text-slate-300">
          AskBob looks at this job’s status, quotes, calls, messages, and appointments to suggest a next step. Use this to guide
          your follow-up, not replace your judgment.
        </p>
        <p className="text-xs text-muted-foreground">{contextUsedText}</p>
      </div>
      <div className="flex flex-col gap-2">
        <HbButton
          size="sm"
          variant="secondary"
          disabled={isLoading}
          onClick={handleRequest}
        >
          {isLoading ? "Analyzing follow-up…" : "Get follow-up recommendation"}
        </HbButton>
        {errorMessage && <p className="text-sm text-rose-400">{errorMessage}</p>}
      </div>
      {result && (
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Suggested action</p>
            <p className="text-sm font-semibold text-slate-100">{result.recommendedAction}</p>
          </div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Why AskBob suggests this</p>
          <p className="text-sm text-slate-300">{result.rationale}</p>
          {result.steps.length > 0 && (
            <ol className="space-y-2 text-sm text-slate-300">
              {result.steps.map((step, index) => (
                <li key={`step-${index}`} className="space-y-1">
                  <p className="font-semibold text-slate-100">
                    {index + 1}. {step.label}
                  </p>
                  {step.detail && <p className="text-xs text-slate-500">{step.detail}</p>}
                </li>
              ))}
            </ol>
          )}
          {signalText && (
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{signalText}</p>
          )}
          {result.riskNotes && (
            <p className="text-xs text-slate-500">Note: {result.riskNotes}</p>
          )}
          {showMessageCTAs && (
            <div className="space-y-2 pt-2">
              <div className="space-y-2">
                <HbButton
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  disabled={isDrafting}
                  onClick={handleDraftClick}
                >
                  {isDrafting ? "Drafting…" : "Draft follow-up message with AskBob"}
                </HbButton>
                {draftError && <p className="text-sm text-rose-400">{draftError}</p>}
              </div>
              {followupComposerHref && (
                <HbButton
                  as={Link}
                  href={followupComposerHref}
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={handleComposeClick}
                >
                  Compose follow-up message
                </HbButton>
              )}
              {followupDraftHint && (
                <p className="text-xs text-slate-400">{followupDraftHint}</p>
              )}
            </div>
          )}
        </div>
      )}
    </HbCard>
  );
}
