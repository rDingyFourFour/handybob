import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
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
    const links = Array.from(tabBar?.querySelectorAll("a") ?? []);
    expect(links).toHaveLength(4);
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      "Home",
      "Jobs",
      "Calls",
      "Settings",
    ]);
    const jobsLink = container.querySelector('a[href="/jobs"]');
    expect(jobsLink?.getAttribute("aria-current")).toBe("page");
    expect(container.innerHTML.toLowerCase()).not.toContain("badge");
    expect(container.innerHTML.toLowerCase()).not.toContain("message");
    expect(container.querySelector('a[href="/calls"] svg')).toBeTruthy();
    expect(container.querySelector('a[href="/settings"] svg')).toBeTruthy();
  });

  it("highlights the active tab deterministically based on the pathname", () => {
    const cases = [
      { pathname: "/jobs/123", href: "/jobs" },
      { pathname: "/calls/recent", href: "/calls" },
      { pathname: "/m", href: "/m" },
      { pathname: "/settings/profile", href: "/settings" },
    ];
    for (const { pathname, href } of cases) {
      mockedUsePathname.mockReturnValue(pathname);
      renderShell();
      const activeLinks = container.querySelectorAll('a[aria-current="page"]');
      expect(activeLinks).toHaveLength(1);
      expect(activeLinks[0]?.getAttribute("href")).toBe(href);
    }
  });

  it("hides the tab bar when requested", () => {
    mockedUsePathname.mockReturnValue("/settings");
    renderShell({ hideTabBar: true });

    expect(container.querySelector('[data-testid="mobile-tab-bar"]')).toBeNull();
  });
});
