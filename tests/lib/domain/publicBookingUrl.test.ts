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

describe("publicBookingPath", () => {
  it("returns the canonical booking path", async () => {
    const { publicBookingPath } = await import(
      "@/lib/domain/workspaces/publicBookingUrl"
    );
    expect(publicBookingPath("workspace-slug")).toBe("/public/bookings/workspace-slug");
  });

  it("trims and lowercases the slug", async () => {
    const { publicBookingPath } = await import(
      "@/lib/domain/workspaces/publicBookingUrl"
    );
    expect(publicBookingPath("  My-Slug  ")).toBe("/public/bookings/my-slug");
  });
});

describe("publicBookingUrl", () => {
  it("uses the configured app url when available", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test/";
    vi.resetModules();
    const { publicBookingUrl } = await import(
      "@/lib/domain/workspaces/publicBookingUrl"
    );
    expect(publicBookingUrl("workspace-slug")).toBe(
      "https://example.test/public/bookings/workspace-slug",
    );
  });

  it("returns null when the app url is not configured", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.resetModules();
    const { publicBookingUrl } = await import(
      "@/lib/domain/workspaces/publicBookingUrl"
    );
    expect(publicBookingUrl("workspace-slug")).toBeNull();
  });
});
