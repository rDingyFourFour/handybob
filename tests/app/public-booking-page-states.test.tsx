import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";
import { PublicBookingConfirmation } from "@/app/public/bookings/[slug]/PublicBookingConfirmation";

const createAdminClientMock = vi.fn();

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

vi.mock("@/app/public/bookings/[slug]/BookingForm", () => ({
  BookingForm: () => <div>BookingForm mock</div>,
}));

import PublicBookingPage from "@/app/public/bookings/[slug]/page";

describe("public booking page states", () => {
  beforeEach(() => {
    createAdminClientMock.mockReset();
  });

  it("renders the header and not found state for unknown slugs", async () => {
    const supabaseState = setupSupabaseMock({
      workspaces: { data: [], error: null },
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);

    const markup = renderToStaticMarkup(
      await PublicBookingPage({ params: Promise.resolve({ slug: "missing" }) }),
    );

    expect(markup).toContain("HandyBob Booking");
    expect(markup).toContain("Booking link format: /public/bookings/{workspaceSlug}");
    expect(markup).toContain("Current slug: missing");
    expect(markup).toContain("Link not found");
    expect(markup).toContain('data-testid="public-booking-state"');
    expect(markup).toContain("<section");
  });

  it("renders the inactive state when the workspace is disabled", async () => {
    const supabaseState = setupSupabaseMock({
      workspaces: {
        data: [
          {
            id: "workspace-1",
            slug: "sleepy",
            name: "Sleepy Workspace",
            brand_name: "Sleepy Brand",
            brand_tagline: null,
            public_lead_form_enabled: false,
          },
        ],
        error: null,
      },
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);

    const markup = renderToStaticMarkup(
      await PublicBookingPage({ params: Promise.resolve({ slug: "sleepy" }) }),
    );

    expect(markup).toContain("Sleepy Brand");
    expect(markup).toContain("Booking link format: /public/bookings/{workspaceSlug}");
    expect(markup).toContain("Current slug: sleepy");
    expect(markup).toContain("This booking link is not active");
    expect(markup).toContain('data-testid="public-booking-state"');
    expect(markup).toContain("<section");
    expect(markup).not.toContain("BookingForm mock");
    expect(markup).not.toContain("public-booking-form-container");
  });

  it("renders the enabled state with confirmation and form", async () => {
    const supabaseState = setupSupabaseMock({
      workspaces: {
        data: [
          {
            id: "workspace-1",
            slug: "ready",
            name: "Ready Workspace",
            brand_name: "Ready Brand",
            brand_tagline: "Ready to help.",
            public_lead_form_enabled: true,
          },
        ],
        error: null,
      },
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);

    const markup = renderToStaticMarkup(
      await PublicBookingPage({ params: Promise.resolve({ slug: "ready" }) }),
    );

    expect(markup).toContain("Ready Brand");
    expect(markup).toContain("Booking link format: /public/bookings/{workspaceSlug}");
    expect(markup).toContain("Current slug: ready");
    expect(markup).toContain("You&#x27;re booking with Ready Brand.");
    expect(markup).toContain("BookingForm mock");
    expect(markup).toContain('data-testid="public-booking-form-container"');
    expect(markup).toMatch(/<div[^>]*data-testid="public-booking-form-container"/);
    expect(markup).toContain('data-testid="public-booking-state"');
    expect(markup).toContain("<section");
  });

  it("snapshots confirmation markup without time tokens", () => {
    const markup = renderToStaticMarkup(
      <PublicBookingConfirmation
        jobId="job-1"
        customerId="customer-1"
        ownerHandoff={{ eligible: false }}
      />,
    );

    expect(markup).toMatchInlineSnapshot(
      `"<div class="space-y-6" data-testid="public-booking-confirmation" data-job-id="job-1" data-customer-id="customer-1"><div class="space-y-3"><h2 class="text-2xl font-semibold text-slate-50">Request received</h2><p class="hb-muted">We&#x27;ll review your request and reach out shortly.</p><p class="hb-muted">Look out for a call, text, or email if you shared contact details.</p></div><div class="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><h3 class="text-sm font-semibold text-slate-100">What happens next</h3><p class="mt-2 text-sm text-slate-300">We&#x27;ll confirm the details, timing, and next steps after reviewing your request.</p></div><div class="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><div class="text-xs uppercase tracking-wide text-slate-400">Job reference</div><div class="mt-1 text-sm font-semibold text-slate-100">job-1</div></div><div class="flex flex-wrap items-center gap-3" data-testid="public-booking-confirmation-actions"><button type="button" class="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-100 hover:border-slate-500">Submit another request</button></div></div>"`,
    );
    expect(markup).not.toMatch(/\b(AM|PM)\b/);
  });
});
