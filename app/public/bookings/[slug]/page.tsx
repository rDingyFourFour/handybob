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
  slugLabel: string;
  brand: string;
  tagline: string | null;
  content: ReactNode;
};

function PublicBookingShell({ slugLabel, brand, tagline, content }: PublicBookingShellProps) {
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
            {tagline && <p className="hb-muted text-sm">{tagline}</p>}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
            Booking link: {slugLabel}
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
  const resolvedParams = (await params) ?? {};
  const slug = typeof resolvedParams.slug === "string" ? resolvedParams.slug.trim() : "";
  const supabase = createAdminClient();
  const slugLabel = `/public/bookings/${slug || "unknown"}`;

  if (!slug) {
    console.log("[public-booking-page-view]", {
      slug: null,
      workspaceFound: false,
      enabled: false,
    });
    return (
      <PublicBookingShell
        slugLabel={slugLabel}
        brand="Booking request"
        tagline="Trusted help for your home."
        content={renderNotFoundState()}
      />
    );
  }
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, slug, name, brand_name, brand_tagline, public_lead_form_enabled")
    .eq("slug", slug)
    .maybeSingle<WorkspacePublicProfile>();

  if (!workspace) {
    console.log("[public-booking-page-view]", {
      slug,
      workspaceFound: false,
      enabled: false,
    });
    return (
      <PublicBookingShell
        slugLabel={slugLabel}
        brand="Booking request"
        tagline="Trusted help for your home."
        content={renderNotFoundState()}
      />
    );
  }

  const enabled = workspace.public_lead_form_enabled !== false;

  const brand = workspace.brand_name || workspace.name || "Contractor";
  const tagline = workspace.brand_tagline || "Trusted help for your home.";

  console.log("[public-booking-page-view]", {
    slug: workspace.slug,
    workspaceFound: true,
    enabled,
  });

  if (!enabled) {
    return (
      <PublicBookingShell
        slugLabel={slugLabel}
        brand={brand}
        tagline={tagline}
        content={renderInactiveState()}
      />
    );
  }

  return (
    <PublicBookingShell
      slugLabel={slugLabel}
      brand={brand}
      tagline={tagline}
      content={
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-black/30 backdrop-blur">
            <BookingForm workspaceSlug={workspace.slug} workspaceName={brand} />
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
      }
    />
  );
}

const PublicBookingPage = shouldStubPublicBooking ? PublicBookingStub : PublicBookingPageMain;

export default PublicBookingPage;

function renderInactiveState() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center shadow-xl shadow-black/30">
      <h2 className="text-2xl font-semibold">This booking link is not active</h2>
      <p className="hb-muted">
        Please copy the link from inside the app and make sure bookings are enabled for this workspace.
      </p>
    </div>
  );
}

function renderNotFoundState() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center shadow-xl shadow-black/30">
      <h2 className="text-2xl font-semibold">We couldn’t find this booking page</h2>
      <p className="hb-muted">
        The slug is invalid or no longer active. Please copy the link from inside the app and try again.
      </p>
    </div>
  );
}
