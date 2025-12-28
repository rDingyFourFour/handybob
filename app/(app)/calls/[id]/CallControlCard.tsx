"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { cacheAskBobMessageDraft } from "@/utils/askbob/messageDraftCache";

type TimelineRow = {
  key: string;
  label: string;
  status: string;
  timestamp: string;
};

type PrimaryCta = {
  kind:
    | "start-automated-call"
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
  timelineRows: TimelineRow[];
  primaryCta: PrimaryCta;
  primaryCtaExplanation: string;
  secondaryActions: {
    jobHref: string | null;
    callsHref: string;
  };
  manualEscape: {
    jobId: string | null;
    customerId: string | null;
    customerPhone: string | null;
    scriptSummary: string | null;
    messagesHref: string;
  };
  afterCallDraft: {
    body: string | null;
  };
};

type CallControlCardProps = {
  model: CallControlCardModel;
};

type CopyState = "idle" | "copied";

const COPY_RESET_MS = 2000;
const WORKSPACE_NAV_EVENT = "calls-session-workspace-navigate";

export default function CallControlCard({ model }: CallControlCardProps) {
  const router = useRouter();
  const [numberCopyState, setNumberCopyState] = useState<CopyState>("idle");
  const [scriptCopyState, setScriptCopyState] = useState<CopyState>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedDraftBody = model.afterCallDraft.body?.trim() ?? "";
  const trimmedScriptSummary = model.manualEscape.scriptSummary?.trim() ?? "";
  const trimmedCustomerPhone = model.manualEscape.customerPhone?.trim() ?? "";

  const hasDraft = Boolean(trimmedDraftBody && model.manualEscape.jobId);
  const hasCustomerPhone = Boolean(trimmedCustomerPhone);
  const hasScriptSummary = Boolean(trimmedScriptSummary);

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
      workspaceId: model.workspaceId,
      callId: model.callId,
      jobId: model.manualEscape.jobId,
      customerId: model.manualEscape.customerId,
      hasCustomerPhone,
      hasScriptSummary,
    });
    await handleCopyText(trimmedCustomerPhone, setNumberCopyState);
  }, [
    handleCopyText,
    hasCustomerPhone,
    hasScriptSummary,
    model.callId,
    model.manualEscape.customerId,
    model.manualEscape.jobId,
    model.workspaceId,
    trimmedCustomerPhone,
  ]);

  const handleCopyScript = useCallback(async () => {
    console.log("[calls-session-manual-escape-copy-script-click]", {
      workspaceId: model.workspaceId,
      callId: model.callId,
      jobId: model.manualEscape.jobId,
      customerId: model.manualEscape.customerId,
      hasCustomerPhone,
      hasScriptSummary,
    });
    await handleCopyText(trimmedScriptSummary, setScriptCopyState);
  }, [
    handleCopyText,
    hasCustomerPhone,
    hasScriptSummary,
    model.callId,
    model.manualEscape.customerId,
    model.manualEscape.jobId,
    model.workspaceId,
    trimmedScriptSummary,
  ]);

  const handleOpenComposer = useCallback(() => {
    if (!hasDraft || !model.manualEscape.jobId) {
      return;
    }
    const draftKey = cacheAskBobMessageDraft({
      body: trimmedDraftBody,
      jobId: model.manualEscape.jobId,
      customerId: model.manualEscape.customerId,
      origin: "call_session_after_call",
      workspaceId: model.workspaceId,
      callId: model.callId,
    });
    const params = new URLSearchParams({
      compose: "1",
      origin: "call_session_after_call",
      jobId: model.manualEscape.jobId,
    });
    if (model.manualEscape.customerId) {
      params.set("customerId", model.manualEscape.customerId);
    }
    if (draftKey) {
      params.set("draftKey", draftKey);
    }
    console.log("[calls-session-actionbar-open-composer-click]", {
      workspaceId: model.workspaceId,
      callId: model.callId,
      jobId: model.manualEscape.jobId,
      hasDraft,
    });
    router.push(`/messages?${params.toString()}`);
  }, [
    hasDraft,
    model.callId,
    model.manualEscape.customerId,
    model.manualEscape.jobId,
    model.workspaceId,
    router,
    trimmedDraftBody,
  ]);

  const handleRefreshStatus = useCallback(() => {
    console.log("[calls-session-twilio-status-refresh-click]", { callId: model.callId });
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, [model.callId]);

  const handleWorkspaceNavigate = useCallback(
    (hash: string, tab: "prepare" | "during" | "after") => {
      if (typeof window === "undefined") {
        return;
      }
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
    [],
  );

  const handleOpenJobClick = useCallback(() => {
    console.log("[calls-session-actionbar-open-job-click]", {
      workspaceId: model.workspaceId,
      callId: model.callId,
      jobId: model.manualEscape.jobId,
      hasDraft,
    });
  }, [hasDraft, model.callId, model.manualEscape.jobId, model.workspaceId]);

  const handleOpenCallsClick = useCallback(() => {
    console.log("[calls-session-actionbar-open-calls-click]", {
      workspaceId: model.workspaceId,
      callId: model.callId,
      jobId: model.manualEscape.jobId,
      hasDraft,
    });
  }, [hasDraft, model.callId, model.manualEscape.jobId, model.workspaceId]);

  const handleOpenMessagesClick = useCallback(() => {
    console.log("[calls-session-manual-escape-open-messages-click]", {
      workspaceId: model.workspaceId,
      callId: model.callId,
      jobId: model.manualEscape.jobId,
      customerId: model.manualEscape.customerId,
      hasCustomerPhone,
      hasScriptSummary,
    });
  }, [
    hasCustomerPhone,
    hasScriptSummary,
    model.callId,
    model.manualEscape.customerId,
    model.manualEscape.jobId,
    model.workspaceId,
  ]);

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
    if (primaryCta.kind === "refresh-status") {
      return (
        <HbButton {...sharedProps} onClick={handleRefreshStatus} disabled={primaryCta.disabled}>
          {primaryCta.label}
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
    handleOpenComposer,
    handleRefreshStatus,
    handleWorkspaceNavigate,
    hasDraft,
    primaryCta,
  ]);

  return (
    <HbCard data-testid="call-control-card" className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            {model.identity.directionLabel}
          </p>
          {model.identity.isInbound && (
            <span className="inline-flex items-center rounded-full border border-slate-800/60 bg-slate-950/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-300">
              Inbound
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-100">
          <span>From: {model.identity.from}</span>
          <span className="text-slate-400">To: {model.identity.to}</span>
          <span className="text-slate-400">Created {model.identity.createdLabel}</span>
        </div>
      </div>

      <div data-testid="call-control-card-timeline" className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Call timeline</p>
        <div className="space-y-2">
          {model.timelineRows.map((row) => (
            <div
              key={row.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2 text-sm"
            >
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  {row.label}
                </p>
                <p className="text-sm text-slate-100">{row.status}</p>
              </div>
              <p className="text-xs text-slate-400">{row.timestamp}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-950/60 p-3">
        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Primary</p>
        {primaryButton}
        <div data-testid="call-session-primary-cta-explanation">
          <p className="text-xs text-slate-400">{model.primaryCtaExplanation}</p>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-950/60 p-3">
        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Secondary</p>
        <div className="flex flex-col gap-2">
          <HbButton
            as={Link}
            href={model.secondaryActions.jobHref ?? "/jobs"}
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={handleOpenJobClick}
          >
            Open job
          </HbButton>
          <HbButton
            as={Link}
            href={model.secondaryActions.callsHref}
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={handleOpenCallsClick}
          >
            Open calls list
          </HbButton>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-800/60 bg-slate-950/60 p-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
            Manual escape hatches
          </p>
          <p className="text-xs text-slate-400">
            Manual actions stay available even if automation is blocked.
          </p>
        </div>

        {hasCustomerPhone ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-950/80 p-3">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Manual call</p>
              <p className="text-base font-semibold text-slate-100 select-text">
                {trimmedCustomerPhone}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <HbButton variant="secondary" size="sm" onClick={handleCopyNumber}>
                  {numberCopyState === "copied" ? "Copied" : "Copy number"}
                </HbButton>
                {hasScriptSummary ? (
                  <HbButton variant="ghost" size="sm" onClick={handleCopyScript}>
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
                  Script summary:{" "}
                  {trimmedScriptSummary.length > 140
                    ? `${trimmedScriptSummary.slice(0, 137)}...`
                    : trimmedScriptSummary}
                </p>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-slate-800/60 bg-slate-950/80 p-3">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Manual follow-up SMS
              </p>
              <p className="text-xs text-slate-400">
                Send a quick SMS with the customer preselected.
              </p>
              <HbButton
                as={Link}
                href={model.manualEscape.messagesHref}
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
    </HbCard>
  );
}
