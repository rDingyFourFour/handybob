import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createAdminClientMock = vi.fn();

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

vi.mock("@/app/public/bookings/[slug]/BookingForm", () => ({
  BookingForm: () => <div>BookingForm mock</div>,
}));

import PublicBookingPage from "@/app/public/bookings/[slug]/page";

type GuardedParams<T> = {
  promise: Promise<T>;
  getDirectAccessCount: () => number;
};

function createGuardedParams<T>(value: T): GuardedParams<T> {
  let directAccessCount = 0;
  const promise = new Proxy(Promise.resolve(value), {
    get(target, prop) {
      if (prop === "then") {
        return target.then.bind(target);
      }
      directAccessCount += 1;
      throw new Error("SYNC_PARAMS_ACCESS");
    },
  });
  return {
    promise: promise as Promise<T>,
    getDirectAccessCount: () => directAccessCount,
  };
}

describe("public bookings async params", () => {
  beforeEach(() => {
    createAdminClientMock.mockReset();
  });

  it("renders the booking flow when workspace is enabled", async () => {
    const supabaseState = setupSupabaseMock({
      workspaces: {
        data: [
          {
            id: "workspace-1",
            slug: "test",
            name: "Test Workspace",
            brand_name: "Test Brand",
            brand_tagline: "Trusted help for your home.",
            public_lead_form_enabled: true,
          },
        ],
        error: null,
      },
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);

    const guardedParams = createGuardedParams({ slug: "test" });
    const markup = renderToStaticMarkup(
      await PublicBookingPage({ params: guardedParams.promise }),
    );

    expect(markup).toContain("Booking request");
    expect(markup).toContain("BookingForm mock");
    expect(markup).toContain('data-testid="public-booking-shell"');
    expect(markup).toContain("/public/bookings/test");
    expect(guardedParams.getDirectAccessCount()).toBe(0);
  });

  it("renders the not found state when workspace is missing", async () => {
    const supabaseState = setupSupabaseMock({
      workspaces: { data: [], error: null },
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);

    const guardedParams = createGuardedParams({ slug: "missing" });
    const markup = renderToStaticMarkup(
      await PublicBookingPage({ params: guardedParams.promise }),
    );

    expect(markup).toContain("We couldn’t find this booking page");
    expect(markup).toContain('data-testid="public-booking-shell"');
    expect(markup).toContain("/public/bookings/missing");
    expect(guardedParams.getDirectAccessCount()).toBe(0);
  });

  it("renders the inactive state when workspace is disabled", async () => {
    const supabaseState = setupSupabaseMock({
      workspaces: {
        data: [
          {
            id: "workspace-1",
            slug: "sleepy",
            name: "Sleepy Workspace",
            brand_name: "Sleepy Brand",
            brand_tagline: "Trusted help for your home.",
            public_lead_form_enabled: false,
          },
        ],
        error: null,
      },
    });
    createAdminClientMock.mockReturnValue(supabaseState.supabase);

    const guardedParams = createGuardedParams({ slug: "sleepy" });
    const markup = renderToStaticMarkup(
      await PublicBookingPage({ params: guardedParams.promise }),
    );

    expect(markup).toContain("This booking link is not active");
    expect(markup).toContain('data-testid="public-booking-shell"');
    expect(markup).toContain("/public/bookings/sleepy");
    expect(guardedParams.getDirectAccessCount()).toBe(0);
  });
});
