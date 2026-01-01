import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import AppShellLayout from "@/app/(app)/layout";
import {
  confusingDesktopRoutes,
  isDesktopShellRequiredRoute,
  isMobileRoute,
  mockGetCurrentWorkspace,
  resetAppShellMocks,
  supabaseAuthMock,
} from "@/tests/app/layout/test-utils";

describe("Desktop shell requirements", () => {
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

  async function renderDesktopLayout() {
    const element = await AppShellLayout({
      children: <div data-testid="layout-child">Layout content</div>,
    });
    act(() => {
      root?.render(element);
    });
    return container;
  }

  function arrangeAuthenticatedSession() {
    supabaseAuthMock.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@example.com" } },
    });
    mockGetCurrentWorkspace.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      workspace: { id: "workspace-1", name: "Test Workspace", owner_id: "owner-1" },
      role: "owner",
    });
  }

  it("renders the header and spacer for desktop routes", async () => {
    expect(isDesktopShellRequiredRoute("/jobs")).toBe(true);
    expect(isMobileRoute("/jobs")).toBe(false);
    arrangeAuthenticatedSession();

    const mounted = await renderDesktopLayout();

    expect(mounted.querySelector('[data-testid="app-shell-header"]')).toBeTruthy();
    const layoutMain = mounted.querySelector("main");
    expect(layoutMain?.className).toContain("pt-16");
  });

  it("still renders the desktop shell for routes that roughly start with /m but are not mobile", async () => {
    confusingDesktopRoutes.forEach((route) => {
      expect(isDesktopShellRequiredRoute(route)).toBe(true);
      expect(isMobileRoute(route)).toBe(false);
    });

    arrangeAuthenticatedSession();

    const mounted = await renderDesktopLayout();

    expect(mounted.querySelector('[data-testid="app-shell-header"]')).toBeTruthy();
    const layoutMain = mounted.querySelector("main");
    expect(layoutMain?.className).toContain("pt-16");
  });
});
