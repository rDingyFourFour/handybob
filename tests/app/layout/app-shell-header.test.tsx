import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/MobileNav", () => ({
  MobileNav: ({ workspaceName }: { workspaceName?: string | null }) => (
    <div data-testid="mobile-nav">{workspaceName}</div>
  ),
}));

import AppShellLayout, { AppShellHeader } from "@/app/(app)/layout";
import {
  mockGetCurrentWorkspace,
  resetAppShellMocks,
  supabaseAuthMock,
} from "@/tests/app/layout/test-utils";

describe("App shell layout", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    resetAppShellMocks();
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
      root = null;
    }
    container.remove();
    resetAppShellMocks();
  });

  it("renders the desktop header with padding for app routes", async () => {
    supabaseAuthMock.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
    });
    mockGetCurrentWorkspace.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      workspace: { id: "workspace-1", name: "Test Workspace", owner_id: "owner-1" },
      role: "owner",
    });

    const element = await AppShellLayout({
      children: <div data-testid="layout-child">Layout content</div>,
    });

    act(() => {
      root?.render(element);
    });

    expect(container.querySelector('[data-testid="app-shell-header"]')).toBeTruthy();
    const layoutMain = container.querySelector('main');
    expect(layoutMain?.className).toContain("pt-16");
  });
});

describe("AppShellHeader", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;
  const DEFAULT_PROPS = {
    brandHref: "/",
    isAuthenticated: true,
    navLinks: [{ label: "Dashboard", href: "/dashboard" }],
    workspaceName: "Test Workspace",
    userInitial: "T",
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
      root = null;
    }
    container.remove();
  });

  it("renders the header when not hidden", () => {
    act(() => {
      root?.render(<AppShellHeader {...DEFAULT_PROPS} />);
    });
    expect(container.querySelector('[data-testid="app-shell-header"]')).toBeTruthy();
  });

  it("omits the header when hideHeader is true", () => {
    act(() => {
      root?.render(<AppShellHeader {...DEFAULT_PROPS} hideHeader />);
    });
    expect(container.querySelector('[data-testid="app-shell-header"]')).toBeNull();
  });
});
