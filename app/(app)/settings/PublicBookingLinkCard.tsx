"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { getPublicBookingUrlForSlug } from "@/lib/domain/workspaces/publicBookingUrl";
import { updatePublicBookingStatus, type PublicBookingToggleState } from "./publicBookingActions";

type CopyStatus = "idle" | "success" | "failure";

type PublicBookingLinkCardProps = {
  slug: string | null | undefined;
  workspaceId: string | null | undefined;
  enabled: boolean;
  canManage: boolean;
};

const copyStatusLabels: Record<CopyStatus, string> = {
  idle: "Copy link",
  success: "Copied",
  failure: "Copy failed",
};

export default function PublicBookingLinkCard({
  slug,
  workspaceId,
  enabled,
  canManage,
}: PublicBookingLinkCardProps) {
  const router = useRouter();
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const initialToggleState: PublicBookingToggleState = {
    status: "idle",
    enabled,
    message: null,
    code: null,
  };
  const [toggleState, formAction, pending] = useActionState(
    updatePublicBookingStatus,
    initialToggleState
  );

  const bookingUrl = useMemo(() => {
    if (!slug || !slug.trim()) {
      return null;
    }
    return getPublicBookingUrlForSlug(slug);
  }, [slug]);

  const statusLabel = toggleState.enabled ? "Active" : "Inactive";
  const statusStyles = toggleState.enabled
    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
    : "border-rose-400/40 bg-rose-500/10 text-rose-200";

  useEffect(() => {
    console.log("[bookings-public-link-visible]", {
      workspaceId,
      workspaceSlug: slug ?? null,
    });
  }, [slug, workspaceId]);

  useEffect(() => {
    if (toggleState.status === "success") {
      console.log("[bookings-enable-toggle-success]", {
        workspaceId,
        workspaceSlug: slug ?? null,
        enabled: toggleState.enabled,
      });
      router.refresh();
    }
    if (toggleState.status === "error") {
      console.log("[bookings-enable-toggle-failure]", {
        workspaceId,
        workspaceSlug: slug ?? null,
        code: toggleState.code ?? "unknown",
      });
    }
  }, [router, slug, toggleState, workspaceId]);

  const handleCopy = async () => {
    if (!bookingUrl) {
      return;
    }
    console.log("[bookings-public-link-copy-click]", {
      workspaceId,
      workspaceSlug: slug ?? null,
    });
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopyStatus("success");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("failure");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    }
  };

  const handleOpen = () => {
    if (!bookingUrl) {
      return;
    }
    console.log("[bookings-public-link-open-click]", {
      workspaceId,
      workspaceSlug: slug ?? null,
    });
    window.open(bookingUrl, "_blank", "noopener,noreferrer");
  };

  const handleToggleClick = () => {
    console.log("[bookings-enable-toggle-click]", {
      workspaceId,
      workspaceSlug: slug ?? null,
      enabled: !toggleState.enabled,
    });
  };

  return (
    <HbCard className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="hb-card-heading text-xl font-semibold text-slate-100">Bookings</h2>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Public links</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusStyles}`}
        >
          {statusLabel}
        </span>
      </div>
      <p className="text-sm text-slate-300">
        Share this link to capture service requests. Each submission creates a lead job and customer
        record in your workspace.
      </p>
      <div className="space-y-3 text-sm text-slate-300">
        <div>
          <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Public booking link
          </span>
          {bookingUrl ? (
            <div className="mt-2">
              <a className="text-amber-200 underline" href={bookingUrl}>
                {bookingUrl}
              </a>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-400">
              Add a workspace slug to enable booking links.
            </p>
          )}
        </div>
        {bookingUrl && (
          <div className="flex flex-wrap gap-2">
            <HbButton type="button" size="sm" variant="secondary" onClick={handleCopy}>
              {copyStatusLabels[copyStatus]}
            </HbButton>
            <HbButton
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleOpen}
            >
              Open
            </HbButton>
          </div>
        )}
      </div>
      <form action={formAction} className="flex items-center justify-between gap-3">
        <input type="hidden" name="enabled" value={String(!toggleState.enabled)} />
        <div className="text-xs text-slate-500">
          Toggle bookings on to show the form at the public URL.
        </div>
        <HbButton
          type="submit"
          size="sm"
          variant="secondary"
          onClick={handleToggleClick}
          disabled={!canManage || pending}
        >
          {toggleState.enabled ? "Disable bookings" : "Enable bookings"}
        </HbButton>
      </form>
      {toggleState.status === "error" && toggleState.message && (
        <p className="text-xs text-rose-300">{toggleState.message}</p>
      )}
    </HbCard>
  );
}
