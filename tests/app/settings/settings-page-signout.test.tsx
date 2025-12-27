import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();
const mockRedirect = vi.fn();
const mockReplace = vi.fn();
const mockSignOut = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
  useRouter: () => ({
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock("@/utils/supabase/server", () => ({
  createServerClient: () => createServerClientMock(),
}));

vi.mock("@/lib/domain/workspaces", () => ({
  getCurrentWorkspace: (...args: unknown[]) => mockGetCurrentWorkspace(...args),
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
  }),
}));

import SettingsHomePage from "@/app/(app)/settings/page";

describe("SettingsHomePage sign-out", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockRedirect.mockReset();
    mockReplace.mockReset();
    mockSignOut.mockReset();
    createServerClientMock.mockReset();
    mockGetCurrentWorkspace.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
    vi.restoreAllMocks();
  });

  async function renderSettings({ slug = "test-workspace" }: { slug?: string | null } = {}) {
    const supabaseState = setupSupabaseMock({
      workspaces: {
        data: [
          {
            id: "workspace-1",
            name: "Test workspace",
            owner_id: "user-1",
            slug,
            brand_name: "Test workspace",
            brand_tagline: "Local service",
            business_phone: "+15555555555",
          },
        ],
        error: null,
      },
    });
    supabaseState.supabase.auth = {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: "user-1",
            email: "user@example.com",
            phone: null,
            user_metadata: {},
          },
        },
      }),
    } as typeof supabaseState.supabase.auth;

    createServerClientMock.mockReturnValue(supabaseState.supabase);
    mockGetCurrentWorkspace.mockResolvedValue({
      user: { id: "user-1" },
      workspace: { id: "workspace-1", name: "Test workspace", owner_id: "user-1", slug },
      role: "owner",
    });

    if (!root) {
      throw new Error("missing root");
    }
    await act(async () => {
      root?.render(await SettingsHomePage());
    });
  }

  async function flushReactUpdates(iterations = 3) {
    for (let i = 0; i < iterations; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  function findButton(label: string) {
    return Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === label,
    );
  }

  it("shows the public booking link when a slug exists", async () => {
    await renderSettings({ slug: "test-workspace" });
    await flushReactUpdates();

    const link = container.querySelector('a[href="/public/bookings/test-workspace"]');
    expect(link).not.toBeNull();
    expect(findButton("Copy link")).toBeDefined();
  });

  it("renders a placeholder when the workspace slug is missing", async () => {
    await renderSettings({ slug: null });
    await flushReactUpdates();

    expect(container.textContent).toContain("Add a workspace slug to enable booking links.");
    expect(findButton("Copy link")).toBeUndefined();
  });

  it("renders Sign out and navigates on success", async () => {
    mockSignOut.mockResolvedValue({ error: null });

    await renderSettings();
    await flushReactUpdates();

    const button = findButton("Sign out");
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReactUpdates();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/login");

    const logCalls = vi.mocked(console.log).mock.calls;
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[settings-signout-click]" &&
          payload.userId === "user-1" &&
          payload.workspaceId === "workspace-1",
      ),
    ).toBe(true);
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[settings-signout-success]" &&
          payload.userId === "user-1" &&
          payload.workspaceId === "workspace-1",
      ),
    ).toBe(true);
  });

  it("shows an error banner when sign-out fails", async () => {
    mockSignOut.mockResolvedValue({ error: { name: "AuthApiError" } });

    await renderSettings();
    await flushReactUpdates();

    const button = findButton("Sign out");
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReactUpdates();

    expect(container.textContent).toContain("We couldn't sign you out. Please try again.");
    expect(mockReplace).not.toHaveBeenCalled();

    const errorCalls = vi.mocked(console.error).mock.calls;
    expect(
      errorCalls.some(
        ([label, payload]) =>
          label === "[settings-signout-failure]" &&
          payload.userId === "user-1" &&
          payload.workspaceId === "workspace-1" &&
          payload.errorCode === "AuthApiError",
      ),
    ).toBe(true);
  });
});
