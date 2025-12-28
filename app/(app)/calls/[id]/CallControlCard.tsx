"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { cacheAskBobMessageDraft } from "@/utils/askbob/messageDraftCache";
import CallStatusStrip from "@/components/calls/CallStatusStrip";
import { startAskBobAutomatedCall } from "@/app/(app)/calls/actions/startAskBobAutomatedCall";
import { callSessionCopy } from "@/lib/ui/copy/callSessionCopy";

type StatusStripItem = {
  key: string;
  label: string;
  status: string;
  timestamp: string;
};

type PrimaryCta = {
  kind:
    | "start-automated-call"
    | "start-guided-call"
    | "refresh-status"
    | "capture-outcome"
    | "generate-followup"
    | "open-composer"
    | "disabled";
  label: string;
  disabled?: boolean;
  href?: string;
  workspaceNavigate?: {
    tab: "prepare" | "during" | "after";
    hash: string;
  };
  automatedCallPayload?: {
    workspaceId: string;
    jobId: string;
    customerId: string | null;
    customerPhone: string;
    scriptBody: string;
    scriptSummary: string | null;
    callId?: string;
  } | null;
};

type CallControlCardModel = {
  workspaceId: string;
  callId: string;
  identity: {
    directionLabel: string;
    isInbound: boolean;
    from: string;
    to: string;
    createdLabel: string;
  };
  headerContext: {
    customerName: string | null;
    jobTitle: string | null;
  };
  statusStripItems: StatusStripItem[];
  primaryCta: PrimaryCta;
  primaryCtaExplanation: string;
  ctaReasonCode: string;
  secondaryActions: {
    jobHref: string | null;
    callsHref: string;
    messagesHref: string | null;
  };
  callContext: {
    jobId: string | null;
    customerId: string | null;
  };
  afterCallDraft: {
    body: string | null;
  };
};

type CallControlCardProps = {
  model: CallControlCardModel;
  modeChooser?: ReactNode;
  details?: ReactNode;
};

const WORKSPACE_NAV_EVENT = "calls-session-workspace-navigate";

export default function CallControlCard({ model, modeChooser, details }: CallControlCardProps) {
  const router = useRouter();

  const trimmedDraftBody = model.afterCallDraft.body?.trim() ?? "";
  const headerTemplate = callSessionCopy.header.subtitleTemplate;
  const headerSubtitle =
    model.headerContext.customerName && model.headerContext.jobTitle
      ? headerTemplate
          .replace("{customerName}", model.headerContext.customerName)
          .replace("{jobTitle}", model.headerContext.jobTitle)
      : callSessionCopy.header.subtitleFallback;

  const hasDraft = Boolean(trimmedDraftBody && model.callContext.jobId);

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
    model.callId,
    model.callContext.customerId,
    model.callContext.jobId,
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
    (hash: string, tab: "prepare" | "during" | "after") => {
      if (typeof window === "undefined") {
        return;
      }
      logPrimaryCtaClick("workspace-navigate");
      window.dispatchEvent(
        new CustomEvent(WORKSPACE_NAV_EVENT, {
          detail: {
            hash,
            tab,
          },
        }),
      );
      window.history.replaceState(null, "", hash);
    },
    [logPrimaryCtaClick],
  );

  const handleOpenJobClick = useCallback(() => {
    console.log("[calls-session-actionbar-open-job-click]", {
      workspaceId: model.workspaceId,
      callId: model.callId,
      jobId: model.callContext.jobId,
      hasDraft,
    });
  }, [hasDraft, model.callId, model.callContext.jobId, model.workspaceId]);

  const handleOpenCallsClick = useCallback(() => {
    console.log("[calls-session-actionbar-open-calls-click]", {
      workspaceId: model.workspaceId,
      callId: model.callId,
      jobId: model.callContext.jobId,
      hasDraft,
    });
  }, [hasDraft, model.callId, model.callContext.jobId, model.workspaceId]);

  const [automatedCallState, setAutomatedCallState] = useState<{
    status: "idle" | "loading" | "error";
    message: string | null;
  }>({ status: "idle", message: null });

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

  const handleOpenMessagesClick = useCallback(() => {
    console.log("[calls-session-manual-escape-open-messages-click]", {
      workspaceId: model.workspaceId,
      callId: model.callId,
      jobId: model.callContext.jobId,
      customerId: model.callContext.customerId,
    });
  }, [model.callId, model.callContext.customerId, model.callContext.jobId, model.workspaceId]);

  const primaryCta = model.primaryCta;
  const primaryButton = useMemo(() => {
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
          onClick={() =>
            handleWorkspaceNavigate(primaryCta.workspaceNavigate!.hash, primaryCta.workspaceNavigate!.tab)
          }
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
        <HbButton
          {...sharedProps}
          as={Link}
          href={primaryCta.href}
          disabled={primaryCta.disabled}
        >
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
    primaryCta,
  ]);

  return (
    <HbCard data-testid="call-control-card" className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {callSessionCopy.header.title}
        </p>
        <h2 className="hb-heading-3 text-xl font-semibold text-white">
          {callSessionCopy.header.title}
        </h2>
        <p className="text-sm text-slate-400">{headerSubtitle}</p>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            {model.identity.directionLabel}
          </p>
          {model.identity.isInbound && (
            <span className="inline-flex items-center rounded-full border border-slate-800/60 bg-slate-950/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-300">
              {callSessionCopy.callControl.inboundBadge}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-100">
          <span>{callSessionCopy.callControl.fromLabel}: {model.identity.from}</span>
          <span className="text-slate-400">
            {callSessionCopy.callControl.toLabel}: {model.identity.to}
          </span>
          <span className="text-slate-400">
            {callSessionCopy.callControl.createdLabel} {model.identity.createdLabel}
          </span>
        </div>
      </div>

      {modeChooser ? (
        <div data-testid="call-control-card-mode-chooser" className="space-y-2">
          {modeChooser}
        </div>
      ) : null}
      <div data-testid="call-control-card-status-strip">
        <CallStatusStrip items={model.statusStripItems} />
      </div>

      <div className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-950/60 p-3">
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

      <div className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-950/60 p-3">
        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
          {callSessionCopy.secondaryActions.title}
        </p>
        <div className="flex flex-col gap-2">
          <HbButton
            as={Link}
            href={model.secondaryActions.jobHref ?? "/jobs"}
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={handleOpenJobClick}
          >
            {callSessionCopy.secondaryActions.openJob}
          </HbButton>
          <HbButton
            as={Link}
            href={model.secondaryActions.callsHref}
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={handleOpenCallsClick}
          >
            {callSessionCopy.secondaryActions.openCalls}
          </HbButton>
          {model.secondaryActions.messagesHref && (
            <HbButton
              as={Link}
              href={model.secondaryActions.messagesHref}
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={handleOpenMessagesClick}
            >
              {callSessionCopy.secondaryActions.openMessages}
            </HbButton>
          )}
        </div>
      </div>
      {details ? (
        <details className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-3">
          <summary className="cursor-pointer text-[11px] uppercase tracking-[0.3em] text-slate-500">
            {callSessionCopy.callControl.detailsLabel}
          </summary>
          <div data-testid="call-control-card-details" className="mt-3">
            {details}
          </div>
        </details>
      ) : null}
    </HbCard>
  );
}
