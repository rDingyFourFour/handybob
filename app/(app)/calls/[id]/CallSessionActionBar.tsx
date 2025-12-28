"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import CallStatusRefreshButton from "@/components/calls/CallStatusRefreshButton";
import { cacheAskBobMessageDraft } from "@/utils/askbob/messageDraftCache";
import type { CallSessionFollowupReadiness } from "@/lib/domain/calls/sessions";

type CallSessionActionBarProps = {
  workspaceId: string;
  callId: string;
  jobId: string | null;
  customerId: string | null;
  callReadiness: CallSessionFollowupReadiness;
  hasAfterCallCard: boolean;
  draftBody: string | null;
  customerPhone: string | null;
  scriptSummary: string | null;
};

type CopyState = "idle" | "copied";

const COPY_RESET_MS = 2000;

function buildMessagesHref({
  customerId,
  jobId,
}: {
  customerId: string | null;
  jobId: string | null;
}) {
  const params = new URLSearchParams({ compose: "1", origin: "calls-followup" });
  if (customerId) {
    params.set("customerId", customerId);
  }
  if (jobId) {
    params.set("jobId", jobId);
  }
  return `/messages?${params.toString()}`;
}

export default function CallSessionActionBar({
  workspaceId,
  callId,
  jobId,
  customerId,
  callReadiness,
  hasAfterCallCard,
  draftBody,
  customerPhone,
  scriptSummary,
}: CallSessionActionBarProps) {
  const router = useRouter();
  const [numberCopyState, setNumberCopyState] = useState<CopyState>("idle");
  const [scriptCopyState, setScriptCopyState] = useState<CopyState>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedDraftBody = draftBody?.trim() ?? "";
  const trimmedScriptSummary = scriptSummary?.trim() ?? "";
  const trimmedCustomerPhone = customerPhone?.trim() ?? "";

  const hasDraft = Boolean(trimmedDraftBody && jobId);
  const hasCustomerPhone = Boolean(trimmedCustomerPhone);
  const hasScriptSummary = Boolean(trimmedScriptSummary);
  const hasOutcomeGap = callReadiness.reasons.some(
    (reason) => reason === "missing_outcome" || reason === "missing_reached_flag",
  );
  const shouldRefreshStatus = callReadiness.reasons.includes("not_terminal");

  const messagesHref = useMemo(
    () =>
      buildMessagesHref({
        customerId,
        jobId,
      }),
    [customerId, jobId],
  );

  const resetCopyState = useCallback((setter: (state: CopyState) => void) => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setter("idle");
      resetTimerRef.current = null;
    }, COPY_RESET_MS);
  }, []);

  const handleCopyText = useCallback(
    async (text: string, setter: (state: CopyState) => void) => {
      if (!text) {
        return;
      }
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        setter("copied");
        resetCopyState(setter);
      } catch (error) {
        console.error("[calls-session-actionbar] copy failed", error);
      }
    },
    [resetCopyState],
  );

  const handleCopyNumber = useCallback(async () => {
    console.log("[calls-session-manual-escape-copy-number-click]", {
      workspaceId,
      callId,
      jobId,
      customerId,
      hasCustomerPhone,
      hasScriptSummary,
    });
    await handleCopyText(trimmedCustomerPhone, setNumberCopyState);
  }, [
    callId,
    customerId,
    handleCopyText,
    hasCustomerPhone,
    hasScriptSummary,
    jobId,
    trimmedCustomerPhone,
    workspaceId,
  ]);

  const handleCopyScript = useCallback(async () => {
    console.log("[calls-session-manual-escape-copy-script-click]", {
      workspaceId,
      callId,
      jobId,
      customerId,
      hasCustomerPhone,
      hasScriptSummary,
    });
    await handleCopyText(trimmedScriptSummary, setScriptCopyState);
  }, [
    callId,
    customerId,
    handleCopyText,
    hasCustomerPhone,
    hasScriptSummary,
    jobId,
    trimmedScriptSummary,
    workspaceId,
  ]);

  const handleOpenComposer = useCallback(() => {
    if (!hasDraft || !jobId) {
      return;
    }
    const draftKey = cacheAskBobMessageDraft({
      body: trimmedDraftBody,
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
    console.log("[calls-session-actionbar-open-composer-click]", {
      workspaceId,
      callId,
      jobId,
      hasDraft,
    });
    router.push(`/messages?${params.toString()}`);
  }, [
    callId,
    customerId,
    hasDraft,
    jobId,
    router,
    trimmedDraftBody,
    workspaceId,
  ]);

  const handleOpenJobClick = useCallback(() => {
    console.log("[calls-session-actionbar-open-job-click]", {
      workspaceId,
      callId,
      jobId,
      hasDraft,
    });
  }, [callId, hasDraft, jobId, workspaceId]);

  const handleOpenCallsClick = useCallback(() => {
    console.log("[calls-session-actionbar-open-calls-click]", {
      workspaceId,
      callId,
      jobId,
      hasDraft,
    });
  }, [callId, hasDraft, jobId, workspaceId]);

  const handleOpenMessagesClick = useCallback(() => {
    console.log("[calls-session-manual-escape-open-messages-click]", {
      workspaceId,
      callId,
      jobId,
      customerId,
      hasCustomerPhone,
      hasScriptSummary,
    });
  }, [
    callId,
    customerId,
    hasCustomerPhone,
    hasScriptSummary,
    jobId,
    workspaceId,
  ]);

  const primaryAction = (() => {
    if (!callReadiness.isReady) {
      if (hasOutcomeGap) {
        return (
          <HbButton
            as={Link}
            href="#call-outcome-capture"
            variant="primary"
            size="md"
            className="w-full"
          >
            Record outcome
          </HbButton>
        );
      }
      if (shouldRefreshStatus) {
        return (
          <div className="inline-flex w-full items-center justify-between rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs uppercase tracking-[0.3em] text-slate-300">
            <span>Refresh status</span>
            <CallStatusRefreshButton callId={callId} />
          </div>
        );
      }
    }
    if (hasAfterCallCard) {
      return (
        <HbButton
          as={Link}
          href="#askbob-after-call"
          variant="primary"
          size="md"
          className="w-full"
        >
          Generate follow-up
        </HbButton>
      );
    }
    return (
      <HbButton variant="primary" size="md" className="w-full" disabled>
        Generate follow-up
      </HbButton>
    );
  })();

  return (
    <div
      data-testid="call-session-action-bar"
      className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200"
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Action bar</p>
        <h2 className="hb-heading-3 text-xl font-semibold text-white">Next action</h2>
        <p className="text-sm text-slate-400">
          Use the primary action to advance the automated workflow, or fall back to manual outreach.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div
          data-testid="call-session-action-bar-primary"
          className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-950/60 p-3"
        >
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Primary</p>
          {primaryAction}
          {!callReadiness.isReady && hasOutcomeGap && (
            <p className="text-xs text-slate-400">
              Capture the reach status and outcome before generating a follow-up.
            </p>
          )}
          {!callReadiness.isReady && shouldRefreshStatus && (
            <p className="text-xs text-slate-400">
              Status updates unlock the next step once the call ends.
            </p>
          )}
        </div>

        <div
          data-testid="call-session-action-bar-secondary"
          className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-950/60 p-3"
        >
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Secondary</p>
          <div className="flex flex-col gap-2">
            {hasDraft && (
              <HbButton
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={handleOpenComposer}
              >
                Open composer with this draft
              </HbButton>
            )}
            <HbButton
              as={Link}
              href={jobId ? `/jobs/${jobId}` : "/jobs"}
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={handleOpenJobClick}
            >
              Open job
            </HbButton>
            <HbButton
              as={Link}
              href="/calls"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={handleOpenCallsClick}
            >
              Open calls list
            </HbButton>
          </div>
        </div>
      </div>

      <div
        data-testid="call-session-action-bar-manual"
        className="space-y-3 rounded-xl border border-slate-800/60 bg-slate-950/60 p-3"
      >
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Manual escape hatches</p>
          <p className="text-xs text-slate-400">
            Manual actions stay available even if automation is blocked.
          </p>
        </div>

        {hasCustomerPhone ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-950/80 p-3">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Manual call</p>
              <p className="text-base font-semibold text-slate-100 select-text">{trimmedCustomerPhone}</p>
              <div className="flex flex-wrap items-center gap-2">
                <HbButton
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyNumber}
                >
                  {numberCopyState === "copied" ? "Copied" : "Copy number"}
                </HbButton>
                {hasScriptSummary ? (
                  <HbButton
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyScript}
                  >
                    {scriptCopyState === "copied" ? "Copied" : "Copy script"}
                  </HbButton>
                ) : (
                  <span className="text-[11px] text-slate-500">
                    Generate a call script from the job to copy it here.
                  </span>
                )}
              </div>
              {hasScriptSummary && (
                <p className="text-[11px] text-slate-400">
                  Script summary: {trimmedScriptSummary.length > 140
                    ? `${trimmedScriptSummary.slice(0, 137)}...`
                    : trimmedScriptSummary}
                </p>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-950/80 p-3">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Manual follow-up SMS</p>
              <p className="text-xs text-slate-400">
                Send a quick SMS with the customer preselected.
              </p>
              <HbButton
                as={Link}
                href={messagesHref}
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={handleOpenMessagesClick}
              >
                Open messages composer
              </HbButton>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Add a customer phone number to unlock manual call and SMS escape hatches.
          </p>
        )}
      </div>
    </div>
  );
}
