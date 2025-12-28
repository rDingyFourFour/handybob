"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { getPublicBookingUrlForSlug } from "@/lib/domain/workspaces/publicBookingUrl";
import BookingLinkCard from "@/app/(app)/settings/BookingLinkCard";
import { updatePublicBookingStatus, type PublicBookingToggleState } from "./publicBookingActions";

type PublicBookingLinkCardProps = {
  slug: string | null | undefined;
  workspaceId: string | null | undefined;
  enabled: boolean;
  canManage: boolean;
};

export default function PublicBookingLinkCard({
  slug,
  workspaceId,
  enabled,
  canManage,
}: PublicBookingLinkCardProps) {
  const router = useRouter();
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

  const statusLabel = toggleState.enabled ? "Enabled" : "Disabled";
  const statusStyles = toggleState.enabled
    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
    : "border-rose-400/40 bg-rose-500/10 text-rose-200";

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
      <p className="text-xs text-slate-400">
        {toggleState.enabled
          ? "Anyone with this link can request a booking."
          : "This booking link is not active."}
      </p>
      <BookingLinkCard
        bookingUrl={bookingUrl}
        isEnabled={toggleState.enabled}
        workspaceId={workspaceId ?? null}
        workspaceSlug={slug ?? null}
      />
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
