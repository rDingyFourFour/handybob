"use client";

import { useMemo, useState } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { getPublicBookingUrlForSlug } from "@/lib/domain/workspaces/publicBookingUrl";
import BookingLinkCard from "@/app/(app)/settings/BookingLinkCard";
import {
  updatePublicBookingEnabledAction,
  type UpdatePublicBookingEnabledResult,
} from "@/app/(app)/settings/actions/updatePublicBookingEnabledAction";

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
  const [toggleEnabled, setToggleEnabled] = useState(enabled);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const bookingUrl = useMemo(() => {
    if (!slug || !slug.trim()) {
      return null;
    }
    return getPublicBookingUrlForSlug(slug);
  }, [slug]);

  const statusLabel = toggleEnabled ? "Enabled" : "Disabled";
  const statusStyles = toggleEnabled
    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
    : "border-rose-400/40 bg-rose-500/10 text-rose-200";

  const handleToggle = async () => {
    if (!canManage || pending) {
      return;
    }
    const previousEnabled = toggleEnabled;
    const nextEnabled = !toggleEnabled;
    setPending(true);
    setErrorMessage(null);
    setErrorCode(null);
    setToggleEnabled(nextEnabled);
    console.log("[settings-booking-toggle-ui-click]", {
      workspaceId,
      workspaceSlug: slug ?? null,
      intendedEnabled: nextEnabled,
    });

    let result: UpdatePublicBookingEnabledResult;
    try {
      result = await updatePublicBookingEnabledAction({ enabled: nextEnabled });
    } catch {
      result = {
        success: false,
        code: "unknown",
        message: "We couldn’t update bookings right now.",
      };
    }

    if (result.success) {
      setToggleEnabled(result.enabled);
      setPending(false);
      console.log("[settings-booking-toggle-ui-result]", {
        workspaceId,
        workspaceSlug: slug ?? null,
        intendedEnabled: nextEnabled,
        success: true,
      });
      return;
    }

    setToggleEnabled(previousEnabled);
    setPending(false);
    setErrorMessage(result.message);
    setErrorCode(result.code);
    console.log("[settings-booking-toggle-ui-result]", {
      workspaceId,
      workspaceSlug: slug ?? null,
      intendedEnabled: nextEnabled,
      success: false,
      code: result.code,
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
        {toggleEnabled
          ? "Anyone with this link can request a booking."
          : "This booking link is not active."}
      </p>
      <BookingLinkCard
        bookingUrl={bookingUrl}
        isEnabled={toggleEnabled}
        workspaceId={workspaceId ?? null}
        workspaceSlug={slug ?? null}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <label className="flex items-center gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              checked={toggleEnabled}
              onChange={handleToggle}
              disabled={!canManage || pending}
            />
            <span>Bookings enabled</span>
          </label>
          <div className="text-xs text-slate-500">
            {pending ? "Saving..." : "Toggle bookings to control public intake."}
          </div>
        </div>
        <HbButton
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleToggle}
          disabled={!canManage || pending}
        >
          {toggleEnabled ? "Disable bookings" : "Enable bookings"}
        </HbButton>
      </div>
      {errorMessage && (
        <p className="text-xs text-rose-300" data-error-code={errorCode ?? undefined}>
          {errorMessage}
        </p>
      )}
    </HbCard>
  );
}
