import { afterEach, describe, expect, it, vi } from "vitest";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    delete (globalThis as { window?: unknown }).window;
  }
  vi.resetModules();
});

describe("public booking url helper guard", () => {
  it("does not touch window during module evaluation", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      get() {
        throw new Error("window accessed");
      },
    });
    vi.resetModules();
    const bookingModule = await import("@/lib/domain/workspaces/publicBookingUrl");
    expect(bookingModule.getPublicBookingUrlForSlug("demo")).toContain("/public/bookings/demo");
  });
});
