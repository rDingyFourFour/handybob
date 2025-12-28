import { afterEach, describe, expect, it, vi } from "vitest";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalAppUrl == null) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  }
  vi.resetModules();
});

describe("getPublicBookingUrlForSlug", () => {
  it("returns the canonical booking path", async () => {
    const { getPublicBookingUrlForSlug } = await import(
      "@/lib/domain/workspaces/publicBookingUrl"
    );
    expect(getPublicBookingUrlForSlug("workspace-slug")).toBe("/public/bookings/workspace-slug");
  });

  it("trims and lowercases the slug", async () => {
    const { getPublicBookingUrlForSlug } = await import(
      "@/lib/domain/workspaces/publicBookingUrl"
    );
    expect(getPublicBookingUrlForSlug("  My-Slug  ")).toBe("/public/bookings/my-slug");
  });

  it("uses the configured app url when available", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test/";
    vi.resetModules();
    const { getPublicBookingUrlForSlug } = await import(
      "@/lib/domain/workspaces/publicBookingUrl"
    );
    expect(getPublicBookingUrlForSlug("workspace-slug")).toBe(
      "https://example.test/public/bookings/workspace-slug",
    );
  });
});
