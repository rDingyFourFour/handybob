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

  it("renders only the approved tabs with deterministic highlighting and no badge artifacts", () => {
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

  it("hides the tab bar when requested", () => {
    mockedUsePathname.mockReturnValue("/settings");
    renderShell({ hideTabBar: true });

    expect(container.querySelector('[data-testid="mobile-tab-bar"]')).toBeNull();
  });

  it("marks the calls tab active when the pathname targets calls", () => {
    mockedUsePathname.mockReturnValue("/calls/recent");
    renderShell();

    const callsLink = container.querySelector('a[href="/calls"]');
    expect(callsLink?.getAttribute("aria-current")).toBe("page");
  });

  it("marks the home tab active for the mobile root", () => {
    mockedUsePathname.mockReturnValue("/m");
    renderShell();

    const homeLink = container.querySelector('a[href="/m"]');
    expect(homeLink?.getAttribute("aria-current")).toBe("page");
  });
});
