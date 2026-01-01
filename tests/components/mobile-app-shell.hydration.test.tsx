import { describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockSignOut = vi.fn(() => Promise.resolve({ error: null }));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signOut: mockSignOut,
    },
  }),
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
