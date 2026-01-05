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
    const tabItems = Array.from(tabBar?.querySelectorAll("a") ?? []);
    expect(tabItems.map((item) => item.textContent?.trim())).toEqual([
      "Home",
      "Jobs",
      "Calls",
    ]);
    const officeButton = tabBar?.querySelector(
      'button[data-testid="mobile-tab-office-button"]',
    ) as HTMLButtonElement | null;
    expect(officeButton).toBeTruthy();
    const officeLabel = officeButton?.querySelector("span:last-child");
    expect(officeLabel?.textContent?.trim()).toBe("Office");
    expect(tabBar?.querySelectorAll("button")).toHaveLength(1);
    expect(container.querySelector('a[href="/dashboard"]')).toBeNull();
    const jobsLink = container.querySelector('a[href="/jobs"]');
    expect(jobsLink?.getAttribute("aria-current")).toBe("page");
    expect(container.innerHTML.toLowerCase()).not.toContain("badge");
    expect(container.innerHTML.toLowerCase()).not.toContain("message");
    expect(container.querySelector('a[href="/calls"] svg')).toBeTruthy();
  });

  it("renders the Office tab icon above the label", () => {
    renderShell();

    const officeButton = container.querySelector(
      'button[data-testid="mobile-tab-office-button"]',
    ) as HTMLButtonElement | null;
    expect(officeButton).toBeTruthy();

    const spans = Array.from(officeButton?.querySelectorAll("span") ?? []);
    expect(spans[0]?.querySelector("svg")).toBeTruthy();
    expect(spans[1]?.textContent?.trim()).toBe("Office");
  });

  it("toggles the Office menu and lets selecting an item refocus the trigger", () => {
    renderShell();

    const officeButton = container.querySelector(
      'button[data-testid="mobile-tab-office-button"]',
    ) as HTMLButtonElement | null;
    expect(officeButton).toBeTruthy();

    act(() => {
      officeButton?.click();
    });
    expect(officeButton?.getAttribute("aria-expanded")).toBe("true");

    const menu = container.querySelector('[role="menu"]');
    expect(menu).toBeTruthy();
    const menuItems = Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? []);
    expect(menuItems.map((item) => item.getAttribute("href"))).toEqual([
      "/messages",
      "/customers",
      "/settings",
      "/billing",
    ]);
    const firstMenuItem = menuItems[0] as HTMLAnchorElement | undefined;
    expect(firstMenuItem).toBeTruthy();
    expect(document.activeElement).toBe(firstMenuItem);

    act(() => {
      firstMenuItem?.click();
    });

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(officeButton?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(officeButton);
  });

  it("renders Office as a menu trigger with aria attributes", () => {
    mockedUsePathname.mockReturnValue("/dashboard");
    renderShell();

    const officeButton = container.querySelector(
      'button[data-testid="mobile-tab-office-button"]',
    ) as HTMLButtonElement | null;
    expect(officeButton).toBeTruthy();
    expect(officeButton?.getAttribute("aria-haspopup")).toBe("menu");
    expect(officeButton?.getAttribute("aria-expanded")).toBe("false");
  });

  it("highlights the active tab deterministically based on the pathname", () => {
    const cases = [
      { pathname: "/dashboard", href: "/m" },
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
    const tabItems = Array.from(tabBar?.querySelectorAll("a") ?? []);
    const labels = tabItems.map((item) => item.textContent?.trim());
    expect(labels).not.toContain("Settings");
  });

  it("hides the tab bar when requested", () => {
    mockedUsePathname.mockReturnValue("/settings");
    renderShell({ hideTabBar: true });

    expect(container.querySelector('[data-testid="mobile-tab-bar"]')).toBeNull();
  });
});
