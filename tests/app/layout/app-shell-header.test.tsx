import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/MobileNav", () => ({
  MobileNav: ({ workspaceName }: { workspaceName?: string | null }) => (
    <div data-testid="mobile-nav">{workspaceName}</div>
  ),
}));

const mockCreateServerClient = vi.fn();
vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => mockCreateServerClient(),
}));

const mockGetCurrentWorkspace = vi.fn();
vi.mock("@/lib/domain/workspaces", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domain/workspaces")>(
    "@/lib/domain/workspaces",
  );
  return {
    ...actual,
    getCurrentWorkspace: () => mockGetCurrentWorkspace(),
  };
});

import AppShellLayout, { AppShellHeader } from "@/app/(app)/layout";

describe("App shell layout", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;
  const supabaseAuthMock = {
    getUser: vi.fn(),
  };
  const supabaseClientMock = { auth: supabaseAuthMock };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mockCreateServerClient.mockReset();
    mockGetCurrentWorkspace.mockReset();
    supabaseAuthMock.getUser.mockReset();
    mockCreateServerClient.mockReturnValue(supabaseClientMock);
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
      root = null;
    }
    container.remove();
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
