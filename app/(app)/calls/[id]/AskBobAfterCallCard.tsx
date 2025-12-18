"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { cacheAskBobAfterCallResult } from "@/utils/askbob/afterCallCache";
import { cacheAskBobMessageDraft } from "@/utils/askbob/messageDraftCache";
import type { AskBobJobAfterCallResult } from "@/lib/domain/askbob/types";
import { runAskBobJobAfterCallAction } from "@/app/(app)/askbob/after-call-actions";
import {
  CallSessionFollowupReadiness,
  CallSessionFollowupReadinessReason,
} from "@/lib/domain/calls/sessions";

type AskBobAfterCallCardProps = {
  callId: string;
  workspaceId: string;
  jobId: string;
  customerId: string;
  hasAskBobScriptBody: boolean;
  callNotes: string | null;
  hasHumanNotes: boolean;
  hasOutcomeSaved: boolean;
  hasOutcomeNotes: boolean;
  callReadiness: CallSessionFollowupReadiness;
  generationSource?: "call_session" | "job_step_8";
};

const CTA_READINESS_MESSAGES: Record<CallSessionFollowupReadinessReason, string> = {
  not_terminal: "Call is still in progress. Wait until it finishes before generating a follow-up.",
  no_outcome: "Record the call outcome before generating a follow-up.",
  no_call_session: "Call session data is unavailable. Refresh the page to try again.",
};

export default function AskBobAfterCallCard({
  callId,
  workspaceId,
  jobId,
  customerId,
  hasAskBobScriptBody,
  callNotes,
  hasHumanNotes,
  hasOutcomeSaved,
  hasOutcomeNotes,
  callReadiness,
  generationSource = "call_session",
}: AskBobAfterCallCardProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AskBobJobAfterCallResult | null>(null);
  const [cacheKey, setCacheKey] = useState<string | null>(null);
  const [serverNotReadyMessage, setServerNotReadyMessage] = useState<string | null>(null);

  const hasContext = useMemo(
    () => Boolean(hasAskBobScriptBody || callNotes?.trim() || hasHumanNotes || hasOutcomeNotes),
    [hasAskBobScriptBody, callNotes, hasHumanNotes, hasOutcomeNotes],
  );

  const readinessIssueMessage =
    callReadiness.reasons.length > 0
      ? callReadiness.reasons
          .map((reason) => CTA_READINESS_MESSAGES[reason])
          .join(" ")
      : null;
  const readinessAlert = serverNotReadyMessage ?? readinessIssueMessage;
  const isReadyForGenerate = callReadiness.isReady && !Boolean(serverNotReadyMessage);
  const buttonDisabled = !hasContext || isLoading || !isReadyForGenerate;
  const buttonLabel = isLoading
    ? "Generating…"
    : result
    ? "Regenerate follow-up"
    : "Generate follow-up";

  useEffect(() => {
    if (callReadiness.isReady) {
      setServerNotReadyMessage(null);
    }
  }, [callReadiness.isReady]);

  const handleGenerate = async () => {
    if (buttonDisabled) {
      return;
    }
    const isRegenerate = Boolean(result);
    console.log("[calls-after-call-ui-generate-click]", {
      callId,
      workspaceId,
      generationSource,
      isRegenerate,
    });
    console.log("[askbob-after-call-ui-generate-click]", {
      callId,
      jobId,
      customerId,
      hasOutcomeSaved,
      hasOutcomeNotes,
      hasAskBobScriptBody,
      generationSource,
    });
    setErrorMessage(null);
    setServerNotReadyMessage(null);
    setIsLoading(true);
    try {
      const response = await runAskBobJobAfterCallAction({
        workspaceId,
        jobId,
        callId,
        generationSource,
      });
      console.log("[calls-after-call-ui-generate-result]", {
        callId,
        workspaceId,
        generationSource,
        success: response.ok,
        failureCode: response.ok ? null : response.code ?? null,
      });
      if (!response.ok) {
        const message = response.message ?? "AskBob could not summarize the call right now.";
        if (response.code === "not_ready_for_after_call") {
          setServerNotReadyMessage(message);
        } else {
          setErrorMessage(message);
        }
        console.log("[askbob-after-call-ui-generate-failure]", {
          callId,
          jobId,
          customerId,
          hasOutcomeSaved,
          hasOutcomeNotes,
          hasAskBobScriptBody,
          errorMessage: message,
        });
        return;
      }
      setResult(response.result);
      const storedKey = cacheAskBobAfterCallResult(jobId, callId, response.result);
      setCacheKey(storedKey);
      console.log("[askbob-after-call-ui-generate-success]", {
        callId,
        jobId,
        customerId,
        hasOutcomeSaved,
        hasOutcomeNotes,
        hasAskBobScriptBody,
        draftLength: response.result.draftMessageBody?.length ?? 0,
        suggestedChannel: response.result.suggestedChannel,
        cacheKey: storedKey,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AskBob could not summarize the call right now.";
      setErrorMessage(message);
      console.log("[askbob-after-call-ui-generate-failure]", {
        callId,
        jobId,
        customerId,
        hasOutcomeSaved,
        hasOutcomeNotes,
        hasAskBobScriptBody,
        errorMessage: message,
      });
      console.log("[calls-after-call-ui-generate-result]", {
        callId,
        workspaceId,
        generationSource,
        success: false,
        failureCode: "exception",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenMessagesComposer = () => {
    if (!result?.draftMessageBody) {
      return;
    }
    const draftKey = cacheAskBobMessageDraft({
      body: result.draftMessageBody,
      jobId,
      customerId,
    });
    const params = new URLSearchParams({
      compose: "1",
      origin: "askbob-after-call",
      jobId,
    });
    if (customerId) {
      params.set("customerId", customerId);
    }
    if (draftKey) {
      params.set("draftKey", draftKey);
    }
    console.log("[askbob-after-call-open-messages]", {
      workspaceId,
      jobId,
      customerId,
      callId,
      draftLength: result.draftMessageBody.length,
    });
    router.push(`/messages?${params.toString()}`);
  };

  const backToJobHref = cacheKey
    ? `/jobs/${jobId}?origin=calls-aftercall&callId=${encodeURIComponent(callId)}&afterCallKey=${encodeURIComponent(
        cacheKey,
      )}`
    : undefined;

  return (
    <HbCard className="space-y-3">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob</p>
        <h3 className="hb-heading-3 text-xl font-semibold">After-call help</h3>
        <p className="text-sm text-slate-400">
          Let AskBob summarize the call and draft a customer message. You can edit before sending.
        </p>
      </div>

      <div className="space-y-2">
        <HbButton
          variant="primary"
          size="md"
          className="w-full"
          onClick={handleGenerate}
          disabled={buttonDisabled}
        >
          {buttonLabel}
        </HbButton>
        {readinessAlert ? (
          <p className="text-xs text-slate-500">{readinessAlert}</p>
        ) : (
          !hasContext && (
            <p className="text-xs text-slate-500">
              AskBob needs at least a script, outcome notes, or call summary to craft the summary.
            </p>
          )
        )}
        {errorMessage && <p className="text-sm text-rose-400">{errorMessage}</p>}
      </div>

      {result && (
        <div className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-200">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call summary</p>
            <p className="text-sm text-slate-200">{result.afterCallSummary}</p>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
              <span>Draft message</span>
              {result.draftMessageBody && (
                <span className="text-[11px] text-slate-400">
                  {result.draftMessageBody.length} characters
                </span>
              )}
            </div>
            {result.draftMessageBody ? (
              <pre
                className="w-full rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm leading-relaxed text-slate-200 whitespace-pre-wrap break-words"
                style={{ overflowWrap: "anywhere" }}
              >
                {result.draftMessageBody}
              </pre>
            ) : (
              <p className="text-xs text-slate-500">AskBob did not propose a message draft.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {result.draftMessageBody && (
              <HbButton
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={handleOpenMessagesComposer}
              >
                Open Messages composer with this draft
              </HbButton>
            )}
            {backToJobHref && (
              <HbButton
                as={Link}
                href={backToJobHref}
                size="sm"
                variant="ghost"
                className="flex-1 text-[11px] uppercase tracking-[0.3em]"
              >
                Back to job
              </HbButton>
            )}
          </div>
        </div>
      )}
    </HbCard>
  );
}
