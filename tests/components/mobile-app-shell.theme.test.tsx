import fs from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";

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

import MobileAppShell from "@/components/layout/MobileAppShell";

const globalsPath = join(process.cwd(), "app", "globals.css");
const expectedTokens = [
  "--theme-background",
  "--theme-card",
  "--theme-card-elevated",
  "--theme-primary",
  "--theme-muted",
  "--theme-divider",
  "--theme-shadow",
  "--theme-button-primary-bg",
  "--theme-radius-lg",
];

describe("MobileAppShell theme tokens", () => {
  it("defines the mobile theme variables and guard class", () => {
    const css = fs.readFileSync(globalsPath, "utf8");
    expect(css).toContain(".hb-mobile-theme");
    expectedTokens.forEach((token) => expect(css).toContain(token));
  });

  it("marks the shell root with the mobile theme class", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(<MobileAppShell>Preview</MobileAppShell>);
    });
    const shell = container.querySelector('[data-testid="mobile-shell"]');
    expect(shell).toBeTruthy();
    expect(shell?.classList.contains("hb-mobile-theme")).toBe(true);
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
