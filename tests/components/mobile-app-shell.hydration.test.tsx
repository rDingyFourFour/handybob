import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
}));

describe("MobileAppShell hydration guard", () => {
  it("does not access window during module evaluation", async () => {
    const globalWithWindow = globalThis as typeof globalThis & { window?: Window };
    const savedWindow = globalWithWindow.window;
    globalWithWindow.window = undefined;

    try {
      const { default: LazyShell } = await import("@/components/layout/MobileAppShell");
      expect(LazyShell).toBeTypeOf("function");
    } finally {
      globalWithWindow.window = savedWindow;
    }
  });
});
