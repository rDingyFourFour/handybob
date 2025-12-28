"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { cacheAskBobAfterCallResult } from "@/utils/askbob/afterCallCache";
import { cacheAskBobMessageDraft } from "@/utils/askbob/messageDraftCache";
import type { AskBobJobAfterCallResult } from "@/lib/domain/askbob/types";
import { runAskBobJobAfterCallAction } from "@/app/(app)/askbob/after-call-actions";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";
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
  primaryVariant?: "primary" | "secondary" | "ghost";
};

const GENERAL_READINESS_MESSAGES: Partial<Record<CallSessionFollowupReadinessReason, string>> = {
  not_terminal: callSessionCopy.wrapUp.afterCall.readiness.notTerminal,
  no_call_session: callSessionCopy.wrapUp.afterCall.readiness.noCallSession,
};

const MISSING_REASON_MESSAGES: Record<CallSessionOutcomeMissingReason, string | null> = {
  missing_outcome: callSessionCopy.wrapUp.afterCall.readiness.missingOutcome,
  missing_reached_flag: callSessionCopy.wrapUp.afterCall.readiness.missingReached,
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
  primaryVariant = "primary",
}: AskBobAfterCallCardProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AskBobJobAfterCallResult | null>(null);
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
    ? callSessionCopy.wrapUp.afterCall.generating
    : callReadiness.isReady && hasDraft
    ? callSessionCopy.wrapUp.afterCall.regenerate
    : callSessionCopy.wrapUp.afterCall.generate;
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
          label: callSessionCopy.wrapUp.afterCall.statusLabels.callState,
          value: callSessionEnrichment.isTerminal
            ? callSessionCopy.wrapUp.afterCall.statusValues.terminal
            : callSessionCopy.wrapUp.afterCall.statusValues.inProgress,
        },
        {
          label: callSessionCopy.wrapUp.afterCall.statusLabels.outcome,
          value: callSessionEnrichment.hasOutcome
            ? callSessionCopy.wrapUp.afterCall.statusValues.recorded
            : callSessionCopy.wrapUp.afterCall.statusValues.missing,
        },
        {
          label: callSessionCopy.wrapUp.afterCall.statusLabels.reached,
          value: callSessionEnrichment.hasReachedFlag
            ? callSessionCopy.wrapUp.afterCall.statusValues.present
            : callSessionCopy.wrapUp.afterCall.statusValues.missing,
        },
        {
          label: callSessionCopy.wrapUp.afterCall.statusLabels.notes,
          value: callSessionEnrichment.hasNotes
            ? callSessionCopy.wrapUp.afterCall.statusValues.present
            : callSessionCopy.wrapUp.afterCall.statusValues.empty,
        },
        {
          label: callSessionCopy.wrapUp.afterCall.statusLabels.recording,
          value: callSessionEnrichment.hasRecordingMetadata
            ? callSessionCopy.wrapUp.afterCall.statusValues.recorded
            : callSessionCopy.wrapUp.afterCall.statusValues.unavailable,
        },
        {
          label: callSessionCopy.wrapUp.afterCall.statusLabels.draft,
          value: callSessionEnrichment.hasAskBobDraft
            ? callSessionCopy.wrapUp.afterCall.statusValues.present
            : callSessionCopy.wrapUp.afterCall.statusValues.empty,
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
        const message = response.message ?? callSessionCopy.wrapUp.afterCall.errorFallback;
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
        error instanceof Error ? error.message : callSessionCopy.wrapUp.afterCall.errorFallback;
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

  return (
    <HbCard id="askbob-after-call" className="space-y-3">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {callSessionCopy.wrapUp.afterCall.badge}
        </p>
        <h3 className="hb-heading-3 text-xl font-semibold">
          {callSessionCopy.wrapUp.afterCall.title}
        </h3>
        <p className="text-sm text-slate-400">{callSessionCopy.wrapUp.afterCall.helper}</p>
      </div>

      <div className="space-y-2">
        {postCallStatusVisible && (
          <div className="space-y-2 rounded-2xl border border-slate-800/60 bg-slate-950/50 p-3 text-xs text-slate-300">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-slate-500">
              <span>{callSessionCopy.wrapUp.afterCall.postCallStatus}</span>
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
          variant={primaryVariant}
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
              {callSessionCopy.wrapUp.afterCall.readiness.missingContext}
            </p>
          )
        )}
        {outcomeSavedHintVisible && (
          <p className="text-xs text-sky-300">
            {callSessionCopy.wrapUp.afterCall.readiness.outcomeSavedHint}
          </p>
        )}
        {callReadiness.isReady && suggestedChannel && (
          <p className="text-xs text-slate-400">
            {callSessionCopy.wrapUp.afterCall.readiness.suggestedChannel}{" "}
            <span className="font-semibold text-slate-100">{suggestedChannel}</span>
          </p>
        )}
        {errorMessage && <p className="text-sm text-rose-400">{errorMessage}</p>}
      </div>

      {(result || (callReadiness.isReady && draftBody)) && (
        <div className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-200">
          {result && (
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                {callSessionCopy.wrapUp.afterCall.summaryLabel}
              </p>
              <p className="text-sm text-slate-200">{result.afterCallSummary}</p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
              <span>{callSessionCopy.wrapUp.afterCall.draftLabel}</span>
              {draftBody && (
                <span className="text-[11px] text-slate-400">
                  {draftBody.length} {callSessionCopy.wrapUp.afterCall.draftCharacters}
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
              <p className="text-xs text-slate-500">{callSessionCopy.wrapUp.afterCall.draftEmpty}</p>
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
                {callSessionCopy.wrapUp.afterCall.openComposer}
              </HbButton>
            )}
          </div>
        </div>
      )}
    </HbCard>
  );
}
