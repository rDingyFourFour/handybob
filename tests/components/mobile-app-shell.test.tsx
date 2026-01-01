import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { usePathname } from "next/navigation";
import MobileAppShell from "@/components/layout/MobileAppShell";
import type { ComponentProps } from "react";

const mockedUsePathname = vi.mocked(usePathname);
type MobileAppShellProps = ComponentProps<typeof MobileAppShell>;

describe("MobileAppShell navigation", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockedUsePathname.mockReset();
    mockedUsePathname.mockReturnValue("/dashboard");
    mockPush.mockReset();
    mockReplace.mockReset();
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    container.remove();
  });

  function renderShell(props: Partial<MobileAppShellProps> = {}) {
    act(() => {
      root?.render(
        <MobileAppShell {...props}>
          {props.children ?? <div>Mobile content</div>}
        </MobileAppShell>,
      );
    });
  }

  it("renders only the approved tabs and no badge artifacts", () => {
    mockedUsePathname.mockReturnValue("/jobs/123");
    renderShell();

    const tabBar = container.querySelector('[data-testid="mobile-tab-bar"]');
    expect(tabBar).toBeTruthy();
    const tabItems = Array.from(tabBar?.querySelectorAll("a, button") ?? []);
    expect(tabItems.map((item) => item.textContent?.trim())).toEqual([
      "Home",
      "Jobs",
      "Calls",
      "Office",
    ]);
    const links = Array.from(tabBar?.querySelectorAll("a") ?? []);
    expect(links).toHaveLength(3);
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      "Home",
      "Jobs",
      "Calls",
    ]);
    const officeButton = tabBar?.querySelector('button[aria-label="Office"]');
    expect(officeButton).toBeTruthy();
    expect(officeButton?.textContent?.trim()).toBe("Office");
    const jobsLink = container.querySelector('a[href="/jobs"]');
    expect(jobsLink?.getAttribute("aria-current")).toBe("page");
    expect(container.innerHTML.toLowerCase()).not.toContain("badge");
    expect(container.innerHTML.toLowerCase()).not.toContain("message");
    expect(container.querySelector('a[href="/calls"] svg')).toBeTruthy();
    expect(container.querySelector('button[aria-label="Office"] svg')).toBeTruthy();
  });

  it("renders the Office tab icon above the label", () => {
    renderShell();

    const officeButton = container.querySelector(
      'button[aria-label="Office"]',
    ) as HTMLButtonElement | null;
    expect(officeButton).toBeTruthy();

    const spans = Array.from(officeButton?.querySelectorAll("span") ?? []);
    expect(spans[0]?.querySelector("svg")).toBeTruthy();
    expect(spans[1]?.textContent?.trim()).toBe("Office");
  });

  it("highlights the active tab deterministically based on the pathname", () => {
    const cases = [
      { pathname: "/jobs/123", href: "/jobs" },
      { pathname: "/calls/recent", href: "/calls" },
      { pathname: "/m", href: "/m" },
      { pathname: "/settings/profile", href: "/m" },
    ];
    for (const { pathname, href } of cases) {
      mockedUsePathname.mockReturnValue(pathname);
      renderShell();
      const activeLinks = container.querySelectorAll('a[aria-current="page"]');
      expect(activeLinks).toHaveLength(1);
      expect(activeLinks[0]?.getAttribute("href")).toBe(href);
    }
  });

  it("never exposes Settings as a primary bottom tab label", () => {
    mockedUsePathname.mockReturnValue("/m");
    renderShell();

    const tabBar = container.querySelector('[data-testid="mobile-tab-bar"]');
    const tabItems = Array.from(tabBar?.querySelectorAll("a, button") ?? []);
    const labels = tabItems.map((item) => item.textContent?.trim());
    expect(labels).not.toContain("Settings");
  });

  it("hides the tab bar when requested", () => {
    mockedUsePathname.mockReturnValue("/settings");
    renderShell({ hideTabBar: true });

    expect(container.querySelector('[data-testid="mobile-tab-bar"]')).toBeNull();
  });
});
