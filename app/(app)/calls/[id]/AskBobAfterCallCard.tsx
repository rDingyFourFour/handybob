"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { cacheAskBobAfterCallResult } from "@/utils/askbob/afterCallCache";
import { cacheAskBobMessageDraft } from "@/utils/askbob/messageDraftCache";
import type { AskBobJobAfterCallResult } from "@/lib/domain/askbob/types";
import { runAskBobJobAfterCallAction } from "@/app/(app)/askbob/after-call-actions";
import {
  CallAutomatedDialSnapshot,
  CallSessionFollowupReadiness,
  CallSessionFollowupReadinessReason,
  CallSessionOutcomeMissingReason,
  getCallSessionOutcomeMissingReason,
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
  automatedDialSnapshot?: CallAutomatedDialSnapshot | null;
  callSessionEnrichment?: {
    isTerminal: boolean;
    hasOutcome: boolean;
    hasReachedFlag: boolean;
    hasNotes: boolean;
    hasRecordingMetadata: boolean;
    hasAskBobDraft: boolean;
  } | null;
  isAskBobAutomatedCall?: boolean;
  callDirection?: string | null;
  reachedCustomer?: boolean | null;
  outcomeCode?: string | null;
  callSessionDraftBody?: string | null;
};

const GENERAL_READINESS_MESSAGES: Partial<Record<CallSessionFollowupReadinessReason, string>> = {
  not_terminal: "Call is still in progress. Wait until it finishes before generating a follow-up.",
  no_call_session: "Call session data is unavailable. Refresh the page to try again.",
};

const MISSING_REASON_MESSAGES: Record<CallSessionOutcomeMissingReason, string | null> = {
  missing_outcome: "Record how the call went before generating a follow-up.",
  missing_reached_flag: "Mark whether the customer was reached before generating a follow-up.",
  ready: null,
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
  automatedDialSnapshot,
  callSessionEnrichment,
  isAskBobAutomatedCall = false,
  callDirection = null,
  reachedCustomer = null,
  outcomeCode = null,
  callSessionDraftBody = null,
}: AskBobAfterCallCardProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AskBobJobAfterCallResult | null>(null);
  const [cacheKey, setCacheKey] = useState<string | null>(null);
  const [serverNotReadyMessage, setServerNotReadyMessage] = useState<string | null>(null);
  const [outcomeSavedHintVisible, setOutcomeSavedHintVisible] = useState(false);
  const suggestedChannelLoggedRef = useRef(false);

  const hasContext = useMemo(
    () => Boolean(hasAskBobScriptBody || callNotes?.trim() || hasHumanNotes || hasOutcomeNotes),
    [hasAskBobScriptBody, callNotes, hasHumanNotes, hasOutcomeNotes],
  );

  const missingReason = getCallSessionOutcomeMissingReason(automatedDialSnapshot ?? null);
  const needsMissingReason =
    !callReadiness.isReady &&
    callReadiness.reasons.some(
      (reason) => reason === "missing_outcome" || reason === "missing_reached_flag",
    );
  const missingReasonMessage = needsMissingReason ? MISSING_REASON_MESSAGES[missingReason] : null;
  const generalReadinessMessage = callReadiness.reasons
    .map((reason) => GENERAL_READINESS_MESSAGES[reason])
    .filter(Boolean)
    .join(" ");
  const readinessAlert =
    serverNotReadyMessage ?? missingReasonMessage ?? (generalReadinessMessage || null);
  const isReadyForGenerate = callReadiness.isReady && !Boolean(serverNotReadyMessage);
  const buttonDisabled = !hasContext || isLoading || !isReadyForGenerate;
  const hasDraft =
    Boolean(result?.draftMessageBody?.trim()) ||
    Boolean(callSessionDraftBody?.trim()) ||
    Boolean(callSessionEnrichment?.hasAskBobDraft);
  const buttonLabel = isLoading
    ? "Generating…"
    : callReadiness.isReady && hasDraft
    ? "Regenerate follow-up"
    : "Generate follow-up";
  const draftBody = result?.draftMessageBody?.trim() || callSessionDraftBody?.trim() || null;
  const readinessState = callReadiness.isReady
    ? "ready"
    : callReadiness.reasons.join("|") || "not_ready";
  const draftLengthBucket = (() => {
    const length = draftBody?.length ?? 0;
    if (length === 0) {
      return "empty";
    }
    if (length <= 160) {
      return "short";
    }
    if (length <= 500) {
      return "medium";
    }
    return "long";
  })();
  const postCallStatusVisible = Boolean(
    callSessionEnrichment &&
      (isAskBobAutomatedCall || callDirection?.toLowerCase() === "inbound"),
  );
  const postCallStatusItems = callSessionEnrichment
    ? [
        {
          label: "Call state",
          value: callSessionEnrichment.isTerminal ? "Terminal" : "In progress",
        },
        {
          label: "Outcome",
          value: callSessionEnrichment.hasOutcome ? "Recorded" : "Missing",
        },
        {
          label: "Reached flag",
          value: callSessionEnrichment.hasReachedFlag ? "Present" : "Missing",
        },
        {
          label: "Notes",
          value: callSessionEnrichment.hasNotes ? "Present" : "Empty",
        },
        {
          label: "Recording",
          value: callSessionEnrichment.hasRecordingMetadata ? "Recorded" : "Unavailable",
        },
        {
          label: "AskBob draft",
          value: callSessionEnrichment.hasAskBobDraft ? "Present" : "Empty",
        },
      ]
    : [];
  const suggestedChannel = useMemo(() => {
    if (!callReadiness.isReady) {
      return null;
    }
    if (reachedCustomer === true) {
      return "Call";
    }
    if (reachedCustomer === false) {
      return "SMS";
    }
    if (outcomeCode?.startsWith("no_answer")) {
      return "SMS";
    }
    return null;
  }, [callReadiness.isReady, outcomeCode, reachedCustomer]);

  useEffect(() => {
    if (callReadiness.isReady) {
      setServerNotReadyMessage(null);
    }
  }, [callReadiness.isReady]);

  useEffect(() => {
    if (!suggestedChannel || suggestedChannelLoggedRef.current) {
      return;
    }
    console.log("[calls-after-call-suggested-channel-visible]", {
      workspaceId,
      callId,
      suggestedChannel,
      reachedCustomer,
      outcomeCode: outcomeCode ?? null,
    });
    suggestedChannelLoggedRef.current = true;
  }, [callId, outcomeCode, reachedCustomer, suggestedChannel, workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const handleOutcomeSaved = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      setOutcomeSavedHintVisible(true);
      timeoutId = window.setTimeout(() => {
        setOutcomeSavedHintVisible(false);
        timeoutId = null;
      }, 4000);
    };
    window.addEventListener("calls-after-call-outcome-saved", handleOutcomeSaved);
    return () => {
      window.removeEventListener("calls-after-call-outcome-saved", handleOutcomeSaved);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  const handleGenerate = async () => {
    if (buttonDisabled) {
      return;
    }
    console.log("[calls-after-call-ui-generate-click]", {
      callId,
      workspaceId,
      readinessState,
      hasDraft,
      label: buttonLabel,
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
        if (response.code?.startsWith("not_ready")) {
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
    if (!draftBody || !callReadiness.isReady) {
      return;
    }
    const draftKey = cacheAskBobMessageDraft({
      body: draftBody,
      jobId,
      customerId,
      origin: "call_session_after_call",
      workspaceId,
      callId,
    });
    const params = new URLSearchParams({
      compose: "1",
      origin: "call_session_after_call",
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
      draftLength: draftBody.length,
    });
    console.log("[calls-after-call-open-composer-click]", {
      workspaceId,
      callId,
      hasDraft: Boolean(draftBody),
      draftLengthBucket,
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
        {postCallStatusVisible && (
          <div className="space-y-2 rounded-2xl border border-slate-800/60 bg-slate-950/50 p-3 text-xs text-slate-300">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-slate-500">
              <span>Post call status</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {postCallStatusItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-lg border border-slate-900/60 bg-slate-950/60 px-2 py-1"
                >
                  <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    {item.label}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
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
        {outcomeSavedHintVisible && (
          <p className="text-xs text-sky-300">
            Outcome saved. You can now generate a follow-up.
          </p>
        )}
        {callReadiness.isReady && suggestedChannel && (
          <p className="text-xs text-slate-400">
            Suggested channel: <span className="font-semibold text-slate-100">{suggestedChannel}</span>
          </p>
        )}
        {errorMessage && <p className="text-sm text-rose-400">{errorMessage}</p>}
      </div>

      {(result || (callReadiness.isReady && draftBody)) && (
        <div className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-200">
          {result && (
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call summary</p>
              <p className="text-sm text-slate-200">{result.afterCallSummary}</p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
              <span>Draft message</span>
              {draftBody && (
                <span className="text-[11px] text-slate-400">
                  {draftBody.length} characters
                </span>
              )}
            </div>
            {draftBody ? (
              <pre
                className="w-full rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm leading-relaxed text-slate-200 whitespace-pre-wrap break-words"
                style={{ overflowWrap: "anywhere" }}
              >
                {draftBody}
              </pre>
            ) : (
              <p className="text-xs text-slate-500">AskBob did not propose a message draft.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {callReadiness.isReady && draftBody && (
              <HbButton
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={handleOpenMessagesComposer}
              >
                Open composer with this draft
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
