"use client";

import { useCallback, useRef, useState } from "react";

import HbButton from "@/components/ui/hb-button";

type CopyState = "idle" | "copied";

const COPY_RESET_MS = 2000;

type CallManualNumberCardProps = {
  workspaceId: string;
  callId: string;
  jobId: string | null;
  customerId: string | null;
  customerPhone: string | null;
  scriptSummary: string | null;
};

export default function CallManualNumberCard({
  workspaceId,
  callId,
  jobId,
  customerId,
  customerPhone,
  scriptSummary,
}: CallManualNumberCardProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedCustomerPhone = customerPhone?.trim() ?? "";
  const trimmedScriptSummary = scriptSummary?.trim() ?? "";
  const hasCustomerPhone = Boolean(trimmedCustomerPhone);
  const hasScriptSummary = Boolean(trimmedScriptSummary);

  const resetCopyState = useCallback(() => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setCopyState("idle");
      resetTimerRef.current = null;
    }, COPY_RESET_MS);
  }, []);

  const handleCopyNumber = useCallback(async () => {
    console.log("[calls-session-manual-escape-copy-number-click]", {
      workspaceId,
      callId,
      jobId,
      customerId,
      hasCustomerPhone,
      hasScriptSummary,
    });
    if (!trimmedCustomerPhone) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(trimmedCustomerPhone);
      setCopyState("copied");
      resetCopyState();
    } catch (error) {
      console.error("[calls-session-actionbar] copy failed", error);
    }
  }, [
    callId,
    customerId,
    hasCustomerPhone,
    hasScriptSummary,
    jobId,
    resetCopyState,
    trimmedCustomerPhone,
    workspaceId,
  ]);

  return (
    <div
      data-testid="call-manual-number-card"
      className="space-y-2 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4 text-sm text-slate-200"
    >
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Manual call</p>
        <p className="text-sm text-slate-400">
          Use this number if you need to call manually.
        </p>
      </div>
      {hasCustomerPhone ? (
        <>
          <p className="text-base font-semibold text-slate-100 select-text">
            {trimmedCustomerPhone}
          </p>
          <HbButton variant="secondary" size="sm" onClick={handleCopyNumber}>
            {copyState === "copied" ? "Copied" : "Copy number"}
          </HbButton>
        </>
      ) : (
        <p className="text-xs text-slate-500">
          Add a customer phone number to unlock manual call tools.
        </p>
      )}
    </div>
  );
}
