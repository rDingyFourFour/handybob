"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import { cacheAskBobMessageDraft } from "@/utils/askbob/messageDraftCache";
import { startAskBobAutomatedCall } from "@/app/(app)/calls/actions/startAskBobAutomatedCall";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";
import type { CallSessionCtaModel } from "./callSessionTypes";

const WORKSPACE_NAVIGATION_ANCHORS = ["#call-workspace", "#call-wrapup"];

function scrollToAnchor(hash: string | undefined) {
  if (!hash || typeof window === "undefined") {
    return;
  }
  const normalized = hash.startsWith("#") ? hash : `#${hash}`;
  const target = document.getElementById(normalized.slice(1));
  if (!target) {
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  if (WORKSPACE_NAVIGATION_ANCHORS.includes(normalized)) {
    window.history.replaceState(null, "", normalized);
  }
}

type CallPrimaryActionBarProps = {
  model: CallSessionCtaModel;
};

export default function CallPrimaryActionBar({ model }: CallPrimaryActionBarProps) {
  const router = useRouter();
  const trimmedDraftBody = model.afterCallDraft.body?.trim() ?? "";
  const hasDraft = Boolean(trimmedDraftBody && model.callContext.jobId);
  const [automatedCallState, setAutomatedCallState] = useState<{
    status: "idle" | "loading" | "error";
    message: string | null;
  }>({ status: "idle", message: null });

  const logPrimaryCtaClick = useCallback(
    (action: string) => {
      console.log("[calls-session-primary-cta-click]", {
        workspaceId: model.workspaceId,
        callId: model.callId,
        jobId: model.callContext.jobId,
        action,
        ctaKind: model.primaryCta.kind,
        ctaReasonCode: model.ctaReasonCode,
        primaryCtaLabel: model.primaryCta.label,
        primaryCtaExplanation: model.primaryCtaExplanation,
      });
    },
    [
      model.callContext.jobId,
      model.callId,
      model.ctaReasonCode,
      model.primaryCta.kind,
      model.primaryCta.label,
      model.primaryCtaExplanation,
      model.workspaceId,
    ],
  );

  const handleOpenComposer = useCallback(() => {
    if (!hasDraft || !model.callContext.jobId) {
      return;
    }
    logPrimaryCtaClick("open-composer");
    const draftKey = cacheAskBobMessageDraft({
      body: trimmedDraftBody,
      jobId: model.callContext.jobId,
      customerId: model.callContext.customerId,
      origin: "call_session_after_call",
      workspaceId: model.workspaceId,
      callId: model.callId,
    });
    const params = new URLSearchParams({
      compose: "1",
      origin: "call_session_after_call",
      jobId: model.callContext.jobId,
    });
    if (model.callContext.customerId) {
      params.set("customerId", model.callContext.customerId);
    }
    if (draftKey) {
      params.set("draftKey", draftKey);
    }
    console.log("[calls-session-actionbar-open-composer-click]", {
      workspaceId: model.workspaceId,
      callId: model.callId,
      jobId: model.callContext.jobId,
      hasDraft,
    });
    router.push(`/messages?${params.toString()}`);
  }, [
    hasDraft,
    logPrimaryCtaClick,
    model.callContext.customerId,
    model.callContext.jobId,
    model.callId,
    model.workspaceId,
    router,
    trimmedDraftBody,
  ]);

  const handleRefreshStatus = useCallback(() => {
    logPrimaryCtaClick("refresh-status");
    console.log("[calls-session-twilio-status-refresh-click]", { callId: model.callId });
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, [logPrimaryCtaClick, model.callId]);

  const handleWorkspaceNavigate = useCallback(
    (hash: string) => {
      logPrimaryCtaClick("workspace-navigate");
      scrollToAnchor(hash);
    },
    [logPrimaryCtaClick],
  );

  const handleStartAutomatedCall = useCallback(async () => {
    const payload = model.primaryCta.automatedCallPayload;
    if (!payload || automatedCallState.status === "loading") {
      return;
    }
    logPrimaryCtaClick("start-automated-call");
    setAutomatedCallState({ status: "loading", message: null });
    try {
      const result = await startAskBobAutomatedCall(payload);
      if (result.status === "failure") {
        setAutomatedCallState({
          status: "error",
          message: result.message ?? callSessionCopy.disabled.safeFailure,
        });
        return;
      }
      const nextCallId = result.callId;
      if (nextCallId && nextCallId !== model.callId) {
        router.push(`/calls/${nextCallId}`);
        return;
      }
      router.refresh();
      setAutomatedCallState({ status: "idle", message: null });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : callSessionCopy.disabled.safeFailure;
      setAutomatedCallState({ status: "error", message });
    }
  }, [
    automatedCallState.status,
    logPrimaryCtaClick,
    model.callId,
    model.primaryCta.automatedCallPayload,
    router,
  ]);

  const primaryButton = useMemo(() => {
    const primaryCta = model.primaryCta;
    const sharedProps = {
      variant: "primary" as const,
      size: "md" as const,
      className: "w-full",
      "data-testid": "call-session-primary-cta",
      "data-cta-role": "primary",
      "data-cta-kind": primaryCta.kind,
    };
    if (primaryCta.kind === "refresh-status") {
      return (
        <HbButton {...sharedProps} onClick={handleRefreshStatus} disabled={primaryCta.disabled}>
          {primaryCta.label}
        </HbButton>
      );
    }
    if (primaryCta.kind === "start-automated-call") {
      const isDisabled = primaryCta.disabled || automatedCallState.status === "loading";
      return (
        <HbButton {...sharedProps} onClick={handleStartAutomatedCall} disabled={isDisabled}>
          {automatedCallState.status === "loading"
            ? callSessionCopy.primaryCta.label.loadingAutomated
            : primaryCta.label}
        </HbButton>
      );
    }
    if (primaryCta.workspaceNavigate) {
      return (
        <HbButton
          {...sharedProps}
          onClick={() => handleWorkspaceNavigate(primaryCta.workspaceNavigate!.hash)}
          disabled={primaryCta.disabled}
        >
          {primaryCta.label}
        </HbButton>
      );
    }
    if (primaryCta.kind === "open-composer") {
      return (
        <HbButton
          {...sharedProps}
          onClick={handleOpenComposer}
          disabled={primaryCta.disabled || !hasDraft}
        >
          {primaryCta.label}
        </HbButton>
      );
    }
    if (primaryCta.href) {
      return (
        <HbButton {...sharedProps} as={Link} href={primaryCta.href} disabled={primaryCta.disabled}>
          {primaryCta.label}
        </HbButton>
      );
    }
    return (
      <HbButton {...sharedProps} disabled>
        {primaryCta.label}
      </HbButton>
    );
  }, [
    automatedCallState.status,
    handleOpenComposer,
    handleRefreshStatus,
    handleStartAutomatedCall,
    handleWorkspaceNavigate,
    hasDraft,
    model.primaryCta,
  ]);

  return (
    <div className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-950/60 p-4" data-testid="call-primary-action-bar">
      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
        {callSessionCopy.callControl.primaryLabel}
      </p>
      {primaryButton}
      <div data-testid="call-session-primary-cta-explanation">
        <p className="text-xs text-slate-400">{model.primaryCtaExplanation}</p>
      </div>
      {automatedCallState.status === "error" && automatedCallState.message && (
        <p className="text-xs text-rose-300">{automatedCallState.message}</p>
      )}
    </div>
  );
}
