"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { getPublicBookingUrlForSlug } from "@/lib/domain/workspaces/publicBookingUrl";

const EXAMPLE_SLUG = "your-workspace-slug";

export default function PublicBookingEntryPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const exampleUrl = getPublicBookingUrlForSlug(EXAMPLE_SLUG);

  useEffect(() => {
    console.log("[public-booking-entry-visible]");
  }, []);

  const handleNavigate = () => {
    const rawSlug = inputRef.current?.value ?? "";
    const trimmedSlug = rawSlug.trim();
    const isEmpty = trimmedSlug.length === 0;
    console.log("[public-booking-entry-navigate]", {
      slug: trimmedSlug,
      isEmpty,
    });
    if (isEmpty) {
      return;
    }
    const destination = getPublicBookingUrlForSlug(trimmedSlug);
    router.push(destination);
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50"
      data-testid="public-booking-entry"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:py-16">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Public booking</p>
          <h1 className="text-3xl font-semibold text-slate-50">Booking</h1>
          <p className="text-sm text-slate-300">
            Booking links follow the format /public/bookings/{"{"}your-workspace-slug{"}"}.
          </p>
        </header>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/30 backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-sm text-slate-200" htmlFor="booking-slug">
                Enter your booking slug
              </label>
              <input
                id="booking-slug"
                name="booking-slug"
                type="text"
                placeholder={EXAMPLE_SLUG}
                ref={inputRef}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm text-slate-100 outline-none ring-0 transition focus:border-amber-300"
              />
            </div>
            <button
              type="button"
              onClick={handleNavigate}
              className="rounded-xl bg-amber-300 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-200"
            >
              Go
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Example: {" "}
            <a className="text-amber-200 underline" href={exampleUrl}>
              {exampleUrl}
            </a>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-xs text-slate-400 shadow-inner shadow-black/30">
          Share the link with customers so they can request a booking without logging in.
        </div>
      </div>
    </div>
  );
}
