"use client";

import { useEffect, useState } from "react";

import HbButton from "@/components/ui/hb-button";

type CopyStatus = "idle" | "success" | "failure";

type BookingLinkCardProps = {
  displayUrlText: string | null;
  absoluteUrlForActions: string | null;
  isEnabled: boolean;
  workspaceId: string | null;
  workspaceSlug: string | null;
};

const copyStatusLabels: Record<CopyStatus, string> = {
  idle: "Copy link",
  success: "Copied",
  failure: "Copy failed",
};

export default function BookingLinkCard({
  displayUrlText,
  absoluteUrlForActions,
  isEnabled,
  workspaceId,
  workspaceSlug,
}: BookingLinkCardProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const resetCopyStatus = () => {
    window.setTimeout(() => setCopyStatus("idle"), 2000);
  };

  useEffect(() => {
    console.log("[settings-booking-link-visible]", {
      workspaceId,
      workspaceSlug,
      displayUrlText: displayUrlText ?? null,
      hasAbsoluteUrlForActions: Boolean(absoluteUrlForActions),
    });
  }, [absoluteUrlForActions, displayUrlText, workspaceId, workspaceSlug]);

  const actionUrl = absoluteUrlForActions ?? displayUrlText;

  const handleCopy = async () => {
    if (!actionUrl) {
      console.log("[settings-booking-link-copy-failure]", {
        workspaceId,
        workspaceSlug,
        errorCode: "missing_url",
        displayUrlText: displayUrlText ?? null,
        hasAbsoluteUrlForActions: Boolean(absoluteUrlForActions),
      });
      setCopyStatus("failure");
      resetCopyStatus();
      return;
    }
    console.log("[settings-booking-link-copy-click]", {
      workspaceId,
      workspaceSlug,
      displayUrlText: displayUrlText ?? null,
      hasAbsoluteUrlForActions: Boolean(absoluteUrlForActions),
    });
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error("clipboard_unavailable");
      }
      await navigator.clipboard.writeText(actionUrl);
      setCopyStatus("success");
      resetCopyStatus();
      console.log("[settings-booking-link-copy-success]", {
        workspaceId,
        workspaceSlug,
        displayUrlText: displayUrlText ?? null,
        hasAbsoluteUrlForActions: Boolean(absoluteUrlForActions),
      });
    } catch (error) {
      const errorCode =
        error instanceof Error && error.message === "clipboard_unavailable"
          ? "clipboard_unavailable"
          : "clipboard_failed";
      setCopyStatus("failure");
      resetCopyStatus();
      console.log("[settings-booking-link-copy-failure]", {
        workspaceId,
        workspaceSlug,
        errorCode,
        displayUrlText: displayUrlText ?? null,
        hasAbsoluteUrlForActions: Boolean(absoluteUrlForActions),
      });
    }
  };

  const handleOpen = () => {
    if (!actionUrl) {
      console.log("[settings-booking-link-open-blocked]", {
        workspaceId,
        workspaceSlug,
        errorCode: "missing_url",
        displayUrlText: displayUrlText ?? null,
        hasAbsoluteUrlForActions: Boolean(absoluteUrlForActions),
      });
      return;
    }
    console.log("[settings-booking-link-open-click]", {
      workspaceId,
      workspaceSlug,
      displayUrlText: displayUrlText ?? null,
      hasAbsoluteUrlForActions: Boolean(absoluteUrlForActions),
    });
    window.open(actionUrl, "_blank", "noopener,noreferrer");
  };

  const shouldShowActions = Boolean(displayUrlText);
  const openDisabled = !displayUrlText;

  return (
    <div className="space-y-3 text-sm text-slate-300" data-testid="booking-link-card">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Public booking link</span>
          {!isEnabled && (
            <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
              Inactive externally
            </span>
          )}
        </div>
        {displayUrlText ? (
          <div className="mt-2 break-all text-amber-200" data-testid="booking-link-url">
            {displayUrlText}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">
            Set a workspace slug to enable a shareable booking link.
          </p>
        )}
      </div>
      {shouldShowActions && (
        <div className="flex flex-wrap gap-2">
          <HbButton type="button" size="sm" variant="secondary" onClick={handleCopy}>
            {copyStatusLabels[copyStatus]}
          </HbButton>
          <HbButton
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleOpen}
            aria-disabled={openDisabled}
            className={openDisabled ? "cursor-not-allowed opacity-60" : undefined}
          >
            Open link
          </HbButton>
        </div>
      )}
    </div>
  );
}
