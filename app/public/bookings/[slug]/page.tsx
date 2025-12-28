// Public booking page: workspace slug resolves via admin client, no auth, only exposes public-friendly brand info and form.
import {
  DISABLE_PUBLIC_BOOKING_FOR_BUILD,
  isProductionBuildPhase,
} from "@/utils/env/buildFlags";
import { createAdminClient } from "@/utils/supabase/admin";
import { BookingForm } from "@/app/public/bookings/[slug]/BookingForm";
import type { ReactNode } from "react";

type WorkspacePublicProfile = {
  id: string;
  name: string | null;
  slug: string;
  brand_name: string | null;
  brand_tagline: string | null;
  public_lead_form_enabled?: boolean | null;
};

export const dynamic = "force-dynamic";

// Diagnostic-only build switch: when enabled we export a minimal stub instead of running Supabase/domain logic.
const shouldStubPublicBooking =
  isProductionBuildPhase && DISABLE_PUBLIC_BOOKING_FOR_BUILD;

type PublicBookingShellProps = {
  slug: string;
  brand: string;
  tagline: string | null;
  content: ReactNode;
};

function PublicBookingShell({ slug, brand, tagline, content }: PublicBookingShellProps) {
  return (
    <div
      className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50"
      data-testid="public-booking-shell"
    >
      <header className="border-b border-slate-800 bg-slate-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-amber-300">Booking request</div>
            <h1 className="text-2xl font-semibold text-slate-50">{brand}</h1>
            <p className="hb-muted text-sm">{tagline}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
            <div>Booking link format: /public/bookings/{`{workspaceSlug}`}</div>
            <div>Current slug: {slug || "none"}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:py-12">{content}</main>
    </div>
  );
}

function PublicBookingStub() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-slate-950 px-4"
      data-testid="public-booking-shell"
    >
      <div className="hb-card max-w-xl text-center space-y-3">
        <h1 className="text-2xl font-semibold">Public booking temporarily disabled for build diagnostics</h1>
        <p className="hb-muted text-sm">
          The public booking form is skipped during this build to keep Supabase and Resend calls out of the compile phase.
        </p>
      </div>
    </div>
  );
}

async function PublicBookingPageMain({
  params,
}: {
  params?: Promise<{ slug?: string | null } | null>;
}) {
  const { slug: rawSlug } = (await params) ?? {};
  const slug = typeof rawSlug === "string" ? rawSlug.trim() : "";
  const supabase = createAdminClient();

  const workspace = slug
    ? (
        await supabase
          .from("workspaces")
          .select("id, slug, name, brand_name, brand_tagline, public_lead_form_enabled")
          .eq("slug", slug)
          .maybeSingle<WorkspacePublicProfile>()
      ).data
    : null;

  const hasWorkspace = Boolean(workspace);
  const enabled = hasWorkspace ? workspace?.public_lead_form_enabled !== false : false;
  const brand = workspace?.brand_name || workspace?.name || "HandyBob Booking";
  const tagline = workspace?.brand_tagline || "Request an appointment";

  console.log("[public-booking-page-rendered]", {
    slug: slug || null,
    hasWorkspace,
    ...(hasWorkspace ? { enabled } : {}),
  });

  if (!slug) {
    return (
      <PublicBookingShell
        slug={slug}
        brand={brand}
        tagline={tagline}
        content={renderPublicBookingState({ type: "not-found" })}
      />
    );
  }

  if (!workspace) {
    return (
      <PublicBookingShell
        slug={slug}
        brand={brand}
        tagline={tagline}
        content={renderPublicBookingState({ type: "not-found" })}
      />
    );
  }

  if (!enabled) {
    return (
      <PublicBookingShell
        slug={slug}
        brand={brand}
        tagline={tagline}
        content={renderPublicBookingState({ type: "inactive" })}
      />
    );
  }

  return (
    <PublicBookingShell
      slug={slug}
      brand={brand}
      tagline={tagline}
      content={renderPublicBookingState({
        type: "enabled",
        slug: workspace.slug,
        brand,
      })}
    />
  );
}

const PublicBookingPage = shouldStubPublicBooking ? PublicBookingStub : PublicBookingPageMain;

export default PublicBookingPage;

type PublicBookingState =
  | { type: "not-found" }
  | { type: "inactive" }
  | { type: "enabled"; slug: string; brand: string };

function renderPublicBookingState(state: PublicBookingState) {
  return (
    <section className="space-y-6" data-testid="public-booking-state">
      {state.type === "not-found" && (
        <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center shadow-xl shadow-black/30">
          <h2 className="text-2xl font-semibold">Link not found</h2>
          <p className="hb-muted">
            This booking link is invalid or has expired. Please check the URL and try again.
          </p>
        </div>
      )}

      {state.type === "inactive" && (
        <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center shadow-xl shadow-black/30">
          <h2 className="text-2xl font-semibold">This booking link is not active</h2>
          <p className="hb-muted">
            Bookings are currently disabled for this business. Please contact them for an updated link or check back later.
          </p>
        </div>
      )}

      {state.type === "enabled" && (
        <>
          <p className="text-sm text-slate-300">You&apos;re booking with {state.brand}.</p>
          <p className="text-xs text-slate-400">
            This is a request form and does not guarantee a booking time.
          </p>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/30 backdrop-blur"
              data-testid="public-booking-form-container"
            >
              <BookingForm workspaceSlug={state.slug} workspaceName={state.brand} />
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20">
                <h3 className="font-semibold text-slate-100">What happens next</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  <li>• We review your request and reach out to confirm details.</li>
                  <li>• Emergencies are prioritized automatically.</li>
                  <li>• A quick description helps us prep the right tools.</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20">
                <h3 className="font-semibold text-slate-100">Quick tips</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  <li>• Include photos when we follow up for faster scheduling.</li>
                  <li>• If you picked a date, we’ll try to match it or propose the closest slot.</li>
                </ul>
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
