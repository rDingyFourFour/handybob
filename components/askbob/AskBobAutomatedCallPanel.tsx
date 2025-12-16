"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { type StartCallWithScriptPayload } from "@/components/askbob/AskBobCallAssistPanel";
import { startAskBobAutomatedCall } from "@/app/(app)/calls/actions/startAskBobAutomatedCall";

const SCRIPT_PREVIEW_LIMIT = 360;

const truncatePreview = (value: string, limit: number) => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}…`;
};

type StatusState = "idle" | "calling" | "success" | "failure";

type Props = {
  workspaceId: string;
  jobId: string;
  customerId?: string | null;
  customerDisplayName?: string | null;
  customerPhoneNumber?: string | null;
  jobTitle?: string | null;
  jobDescription?: string | null;
  callScriptBody?: string | null;
  callScriptSummary?: string | null;
  latestCallOutcomeLabel?: string | null;
  stepCompleted?: boolean;
  stepCollapsed?: boolean;
  onToggleCollapse?: () => void;
  resetToken?: number;
  onReset?: () => void;
  onStartCallWithScript?: (payload: StartCallWithScriptPayload) => void;
  onAutomatedCallSuccess?: (summary: string) => void;
};

export default function AskBobAutomatedCallPanel({
  workspaceId,
  jobId,
  customerId,
  customerDisplayName,
  customerPhoneNumber,
  jobTitle,
  jobDescription,
  callScriptBody,
  callScriptSummary,
  latestCallOutcomeLabel,
  stepCompleted = false,
  stepCollapsed = false,
  onToggleCollapse,
  resetToken,
  onReset,
  onStartCallWithScript,
  onAutomatedCallSuccess,
}: Props) {
  const [status, setStatus] = useState<StatusState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [callSessionId, setCallSessionId] = useState<string | null>(null);
  const [isPlacingCall, setIsPlacingCall] = useState(false);
  const hasResetEffectRunRef = useRef(false);

  const normalizedCustomerName = customerDisplayName?.trim() ?? null;
  const normalizedCustomerPhone = customerPhoneNumber?.trim() ?? null;
  const trimmedScriptBody = callScriptBody?.trim() ?? null;
  const trimmedScriptSummary = callScriptSummary?.trim() ?? null;
  const hasScriptContent = Boolean(trimmedScriptBody || trimmedScriptSummary);
  const scriptPreview = trimmedScriptBody || trimmedScriptSummary || "";
  const previewText = scriptPreview ? truncatePreview(scriptPreview, SCRIPT_PREVIEW_LIMIT) : null;
  const hasCustomerPhone = Boolean(normalizedCustomerPhone);
  const toggleLabel = stepCollapsed ? "Show step" : "Hide step";

  const contextParts = useMemo(() => {
    const parts: string[] = [];
    if (jobTitle?.trim()) {
      parts.push("job title");
    }
    if (jobDescription?.trim()) {
      parts.push("job description");
    }
    if (trimmedScriptSummary) {
      parts.push("latest call script");
    }
    if (latestCallOutcomeLabel) {
      parts.push("latest call outcome");
    }
    return parts;
  }, [jobTitle, jobDescription, trimmedScriptSummary, latestCallOutcomeLabel]);

  const contextText = contextParts.length
    ? `Context used: ${contextParts.join(", ")}`
    : "Context used: none yet. Provide job and call details so AskBob knows what to reference.";

  const canPlaceCall = Boolean(workspaceId && jobId && hasCustomerPhone && hasScriptContent && !isPlacingCall);
  const canOpenCallWorkspace = Boolean(trimmedScriptBody && hasCustomerPhone && onStartCallWithScript && !isPlacingCall);

  const handleLocalReset = useCallback(() => {
    setStatus("idle");
    setStatusMessage(null);
    setCallSessionId(null);
    setIsPlacingCall(false);
  }, []);

  const handleReset = () => {
    handleLocalReset();
    onReset?.();
  };

  useEffect(() => {
    if (resetToken === undefined) {
      return;
    }
    if (!hasResetEffectRunRef.current) {
      hasResetEffectRunRef.current = true;
      return;
    }
    handleLocalReset();
  }, [resetToken, handleLocalReset]);

  useEffect(() => {
    if (!hasScriptContent) {
      handleLocalReset();
    }
  }, [hasScriptContent, handleLocalReset]);

  const handlePlaceCall = useCallback(async () => {
    if (!canPlaceCall || !normalizedCustomerPhone) {
      return;
    }
    setIsPlacingCall(true);
    setStatus("calling");
    setStatusMessage("Placing your automated call...");
    console.log("[askbob-automated-call-ui-request]", {
      workspaceId,
      jobId,
      hasScriptBody: Boolean(trimmedScriptBody),
      hasCustomerPhone,
    });
    try {
      const result = await startAskBobAutomatedCall({
        workspaceId,
        jobId,
        customerId: customerId ?? null,
        customerPhone: normalizedCustomerPhone,
        scriptBody: trimmedScriptBody,
        scriptSummary: trimmedScriptSummary,
      });

      if (result.status === "success") {
        const successLabel = result.label?.trim() || "Automated call started";
        setStatus("success");
        setStatusMessage(successLabel);
        setCallSessionId(result.callId);
        onAutomatedCallSuccess?.(successLabel);
      } else {
        setStatus("failure");
        setStatusMessage(result.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to start the call right now.";
      setStatus("failure");
      setStatusMessage(errorMessage);
    } finally {
      setIsPlacingCall(false);
    }
  }, [
    canPlaceCall,
    customerId,
    jobId,
    normalizedCustomerPhone,
    onAutomatedCallSuccess,
    trimmedScriptBody,
    trimmedScriptSummary,
    workspaceId,
    hasCustomerPhone,
  ]);

  const handleOpenCallWorkspace = () => {
    if (!canOpenCallWorkspace || !trimmedScriptBody) {
      return;
    }
    onStartCallWithScript?.({
      jobId,
      customerId: customerId ?? null,
      customerDisplayName: customerDisplayName ?? null,
      customerPhone: normalizedCustomerPhone,
      scriptBody: trimmedScriptBody,
      scriptSummary: trimmedScriptSummary ?? null,
    });
  };

  const statusCopy = useMemo(() => {
    if (status === "calling") {
      return "Placing the AskBob automated call...";
    }
    if (status === "success") {
      return statusMessage ?? "Call started.";
    }
    if (status === "failure") {
      return statusMessage ?? "Couldn’t place the call. Try again.";
    }
    return "Generate a script in Step 7 and then place an automated call when you’re ready.";
  }, [status, statusMessage]);

  return (
    <HbCard className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AskBob</p>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <h2 className="hb-heading-3 text-xl font-semibold">Step 9 · AskBob automated call</h2>
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
              onClick={onToggleCollapse}
            >
              {toggleLabel}
            </HbButton>
            <HbButton
              variant="ghost"
              size="sm"
              className="px-2 py-0.5 text-[11px] tracking-[0.3em]"
              onClick={handleReset}
            >
              Reset this step
            </HbButton>
          </div>
        </div>
        {!stepCollapsed && (
          <>
            <p className="text-sm text-slate-400">
              AskBob can place an outbound call with the script you prepared in Step 7. Use this when you’re ready to
              have the customer called automatically.
            </p>
            <p className="text-xs text-slate-500">{contextText}</p>
            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Script preview</p>
              {previewText ? (
                <p className="mt-2 whitespace-pre-line text-sm text-slate-200">{previewText}</p>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  Generate a call script from Step 7 so AskBob knows what to say when placing the automated call.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {normalizedCustomerName && (
                <p className="text-sm text-slate-200">Customer: {normalizedCustomerName}</p>
              )}
              {hasCustomerPhone ? (
                <p className="text-sm text-slate-400">Phone: {normalizedCustomerPhone}</p>
              ) : (
                <p className="text-xs text-rose-300">No customer phone on file</p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <HbButton
                variant="primary"
                size="md"
                onClick={handlePlaceCall}
                disabled={!canPlaceCall}
              >
                {isPlacingCall ? "Placing automated call…" : "Place automated call"}
              </HbButton>
              <HbButton variant="secondary" size="md" onClick={handleOpenCallWorkspace} disabled={!canOpenCallWorkspace}>
                Open call workspace instead
              </HbButton>
            </div>
            <div className="text-sm text-slate-400">
              <p>{statusCopy}</p>
              {status === "success" && callSessionId && (
                <Link
                  href={`/calls/${callSessionId}`}
                  className="text-emerald-400 underline-offset-2 hover:text-emerald-200"
                >
                  View call session
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </HbCard>
  );
}
