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

  it("renders the tab bar and highlights the correct tab", () => {
    mockedUsePathname.mockReturnValue("/jobs");
    renderShell({ messagesCount: 2 });

    const tabBar = container.querySelector('[data-testid="mobile-tab-bar"]');
    expect(tabBar).toBeTruthy();
    const jobsLink = container.querySelector('a[href="/jobs"]');
    expect(jobsLink?.getAttribute("aria-current")).toBe("page");
  });

  it("hides the tab bar when requested", () => {
    mockedUsePathname.mockReturnValue("/settings");
    renderShell({ hideTabBar: true });

    expect(container.querySelector('[data-testid="mobile-tab-bar"]')).toBeNull();
  });

  it("shows a quiet badge on the messages tab when there are unread items", () => {
    mockedUsePathname.mockReturnValue("/messages");
    renderShell({ messagesCount: 4 });

    const messagesLink = container.querySelector('a[href="/messages"]');
    expect(messagesLink).toBeTruthy();
    const badge = Array.from(messagesLink?.querySelectorAll("span") ?? []).find((span) =>
      span.classList.contains("bg-[var(--theme-primary)]"),
    );
    expect(badge).toBeTruthy();
  });
});
