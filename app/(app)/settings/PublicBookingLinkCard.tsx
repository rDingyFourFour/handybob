"use client";

import { useEffect, useMemo, useState } from "react";

import HbButton from "@/components/ui/hb-button";
import HbCard from "@/components/ui/hb-card";
import { getPublicBookingUrlForSlug } from "@/lib/domain/workspaces/publicBookingUrl";

type CopyStatus = "idle" | "success" | "failure";

type PublicBookingLinkCardProps = {
  slug: string | null | undefined;
};

export default function PublicBookingLinkCard({ slug }: PublicBookingLinkCardProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  const bookingUrl = useMemo(() => {
    if (!slug || !slug.trim()) {
      return null;
    }
    return getPublicBookingUrlForSlug(slug);
  }, [slug]);

  useEffect(() => {
    console.log("[settings-public-booking-link-visible]");
  }, []);

  const handleCopy = async () => {
    if (!bookingUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopyStatus("success");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("failure");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    }
  };

  const copyLabel =
    copyStatus === "success" ? "Copied" : copyStatus === "failure" ? "Copy failed" : "Copy link";

  return (
    <HbCard className="space-y-4">
      <div>
        <h2 className="hb-card-heading text-xl font-semibold text-slate-100">Public booking link</h2>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Shareable entry URL</p>
      </div>
      {bookingUrl ? (
        <div className="space-y-3 text-sm text-slate-300">
          <a className="text-amber-200 underline" href={bookingUrl}>
            {bookingUrl}
          </a>
          <div>
            <HbButton type="button" size="sm" variant="secondary" onClick={handleCopy}>
              {copyLabel}
            </HbButton>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400">Add a workspace slug to enable booking links.</p>
      )}
    </HbCard>
  );
}
