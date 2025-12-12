"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import type {
  AskBobAfterCallSnapshotPayload,
  AskBobJobAfterCallResult,
} from "@/lib/domain/askbob/types";
import { runAskBobJobAfterCallAction } from "@/app/(app)/askbob/after-call-actions";

type JobAskBobAfterCallPanelProps = {
  workspaceId: string;
  jobId: string;
  jobTitle?: string | null;
  jobDescription?: string | null;
  latestCallLabel?: string | null;
  hasCall?: boolean;
  stepCompleted?: boolean;
  stepCollapsed?: boolean;
  onToggleStepCollapsed?: () => void;
  resetToken?: number;
  onReset?: () => void;
  initialAfterCallSnapshot?: AskBobAfterCallSnapshotPayload | null;
  onAfterCallSummaryChange?: (summary: string | null) => void;
  callHistoryHint?: string | null;
  customerId?: string | null;
};

const summaryFromSnapshot = (snapshot?: AskBobAfterCallSnapshotPayload | null): AskBobJobAfterCallResult | null => {
  if (!snapshot) {
    return null;
  }
  return {
    afterCallSummary: snapshot.afterCallSummary,
    recommendedActionLabel: snapshot.recommendedActionLabel,
    recommendedActionSteps: snapshot.recommendedActionSteps,
    suggestedChannel: snapshot.suggestedChannel,
    draftMessageBody: snapshot.draftMessageBody ?? null,
    urgencyLevel: snapshot.urgencyLevel,
    notesForTech: snapshot.notesForTech ?? null,
    modelLatencyMs: snapshot.modelLatencyMs ?? 0,
    rawModelOutput: null,
  };
};

export default function JobAskBobAfterCallPanel({
  workspaceId,
  jobId,
  jobTitle,
  jobDescription,
  latestCallLabel,
  hasCall = true,
  stepCompleted,
  stepCollapsed = false,
  onToggleStepCollapsed,
  resetToken,
  onReset,
  initialAfterCallSnapshot,
  onAfterCallSummaryChange,
  callHistoryHint,
  customerId,
}: JobAskBobAfterCallPanelProps) {
  const [result, setResult] = useState<AskBobJobAfterCallResult | null>(() =>
    summaryFromSnapshot(initialAfterCallSnapshot),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const hasResetEffectRun = useRef(false);
  const router = useRouter();

  useEffect(() => {
    onAfterCallSummaryChange?.(result?.afterCallSummary ?? null);
  }, [result, onAfterCallSummaryChange]);

  useEffect(() => {
    if (resetToken === undefined) {
      return;
    }
    if (!hasResetEffectRun.current) {
      hasResetEffectRun.current = true;
      return;
    }
    setResult(null);
    setErrorMessage(null);
    setIsLoading(false);
    setCopyStatus("idle");
  }, [resetToken]);

  const handleReset = () => {
    setResult(null);
    setErrorMessage(null);
    setIsLoading(false);
    setCopyStatus("idle");
    hasResetEffectRun.current = true;
    onReset?.();
  };

  const handleSummarize = async () => {
    if (!hasCall) {
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const response = await runAskBobJobAfterCallAction({
        workspaceId,
        jobId,
      });
      if (!response.ok) {
        setErrorMessage(response.message ?? "AskBob could not summarize the call right now.");
        return;
      }
      setResult(response.result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AskBob could not summarize the call right now.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyMessage = async () => {
    if (
      !result?.draftMessageBody ||
      typeof navigator === "undefined" ||
      !navigator.clipboard?.writeText
    ) {
      return;
    }
    try {
      await navigator.clipboard.writeText(result.draftMessageBody);
      setCopyStatus("copied");
      setTimeout(() => {
        setCopyStatus("idle");
      }, 2000);
    } catch (error) {
      console.error("[job-askbob-after-call-panel] copy failed", error);
    }
  };

  const normalizedJobTitle = jobTitle?.trim() ?? "";
  const normalizedJobDescription = jobDescription?.trim() ?? "";
  const contextParts: string[] = [];
  if (normalizedJobTitle) {
    contextParts.push("job title");
  }
  if (normalizedJobDescription) {
    contextParts.push("job description");
  }
  if (latestCallLabel) {
    contextParts.push("last call");
  }
  const contextUsedText =
    contextParts.length > 0
      ? `Context used: ${contextParts.join(", ")}`
      : "Context used: none yet. Provide job and call details so AskBob knows what to reference.";

  const callLabelText = latestCallLabel
    ? `Using the most recent call on this job: ${latestCallLabel}`
    : "No calls recorded for this job yet.";

  const channelLabel =
    result && result.suggestedChannel !== "none"
      ? result.suggestedChannel.toUpperCase()
      : "No outreach needed";

  const storeDraftForComposer = (body: string) => {
    if (typeof window === "undefined") {
      return null;
    }
    const key = `askbob-after-call-draft-${jobId}-${Date.now()}`;
    try {
      const payload = {
        body,
        createdAtIso: new Date().toISOString(),
        origin: "askbob-after-call",
        jobId,
        customerId,
      };
      window.sessionStorage.setItem(key, JSON.stringify(payload));
      return key;
    } catch (error) {
      console.error("[askbob-after-call-panel] failed to cache draft", error);
      return null;
    }
  };

  const handleOpenMessagesComposer = () => {
    if (!result?.draftMessageBody) {
      return;
    }
    const draftKey = storeDraftForComposer(result.draftMessageBody);
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
      customerId: customerId ?? null,
      hasCall,
      draftLength: result.draftMessageBody.length,
    });
    router.push(`/messages?${params.toString()}`);
  };

  return (
    <HbCard className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob</p>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <h2 className="hb-heading-3 text-xl font-semibold">Step 8 · After the call</h2>
            {stepCompleted && (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold tracking-[0.3em] text-emerald-200">
                Done
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HbButton
              variant="ghost"
              size="sm"
              className="px-2 py-0.5 text-[11px] tracking-[0.3em]"
              onClick={onToggleStepCollapsed}
            >
              {stepCollapsed ? "Show step" : "Hide step"}
            </HbButton>
            {result && (
              <HbButton
                variant="ghost"
                size="sm"
                className="px-2 py-0.5 text-[11px] tracking-[0.3em]"
                onClick={handleReset}
              >
                Reset this step
              </HbButton>
            )}
          </div>
        </div>
        {!stepCollapsed && (
          <>
            <p className="text-sm text-slate-400">
              AskBob will summarize your most recent call, highlight what happened, and recommend the best next move.
            </p>
            {callHistoryHint && (
              <p className="text-xs text-slate-400">Call history: {callHistoryHint}</p>
            )}
            <p className="text-xs text-slate-500">{contextUsedText}</p>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
              {callLabelText}
            </div>
            <div className="space-y-2">
              <HbButton
                variant="primary"
                size="md"
                className="w-full"
                onClick={handleSummarize}
                disabled={isLoading || !hasCall}
              >
                {isLoading ? "Summarizing…" : "Summarize last call with AskBob"}
              </HbButton>
              {!hasCall && (
                <p className="text-xs text-slate-500">
                  There are no recorded calls for this job, so AskBob cannot prepare an after-call summary.
                </p>
              )}
              {errorMessage && (
                <p className="text-sm text-rose-400">{errorMessage}</p>
              )}
            </div>
            {result && (
              <div className="space-y-3 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4 text-sm text-slate-200">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Summary</p>
                <p className="text-sm text-slate-200">{result.afterCallSummary}</p>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Recommended next move</p>
                <p className="text-sm font-semibold text-white">{result.recommendedActionLabel}</p>
                <ul className="space-y-1 pl-3 text-slate-300">
                  {result.recommendedActionSteps.map((step, index) => (
                    <li key={`${step}-${index}`} className="list-disc">
                      {step}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-[0.2em] uppercase text-slate-400">
                  <span className="rounded-full border border-slate-700 px-2 py-0.5">{channelLabel}</span>
                  <span className="rounded-full border border-slate-700 px-2 py-0.5">
                    Urgency: {result.urgencyLevel}
                  </span>
                </div>
                {result.notesForTech && (
                  <p className="text-xs text-slate-400">Notes for tech: {result.notesForTech}</p>
                )}
                {result.draftMessageBody && (
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                      <span>Draft message</span>
                      <button
                        type="button"
                        className="text-sky-400 hover:text-sky-200"
                        onClick={handleCopyMessage}
                      >
                        {copyStatus === "copied" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <pre
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm leading-relaxed text-slate-200 whitespace-pre-wrap break-words max-w-full"
                      style={{ overflowWrap: "anywhere" }}
                    >
                      {result.draftMessageBody}
                    </pre>
                    <HbButton
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={handleOpenMessagesComposer}
                    >
                      Open composer with this draft
                    </HbButton>
                  </div>
                )}
            </div>
          )}
          </>
        )}
      </div>
    </HbCard>
  );
}
