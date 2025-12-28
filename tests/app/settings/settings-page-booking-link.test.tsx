import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();
const mockRedirect = vi.fn();
const mockReplace = vi.fn();

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

describe("Settings booking link section", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockRedirect.mockReset();
    mockReplace.mockReset();
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
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.resetModules();
  });

  async function renderSettings({
    slug = "test-workspace",
    publicLeadEnabled = true,
  }: { slug?: string | null; publicLeadEnabled?: boolean } = {}) {
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
    vi.resetModules();
    const { default: SettingsHomePage } = await import("@/app/(app)/settings/page");
    const { publicBookingPath } = await import(
      "@/lib/domain/workspaces/publicBookingUrl"
    );
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
            public_lead_form_enabled: publicLeadEnabled,
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

    return publicBookingPath(slug ?? "");
  }

  async function flushReactUpdates(iterations = 3) {
    for (let i = 0; i < iterations; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  it("shows the canonical booking url and enabled state", async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: clipboardWrite } });
    const openSpy = vi.fn();
    Object.assign(window, { open: openSpy });

    const expectedUrl = await renderSettings({ slug: "test-workspace", publicLeadEnabled: true });
    await flushReactUpdates();

    const url = container.querySelector('[data-testid="booking-link-url"]');
    expect(url?.textContent).toBe(expectedUrl);
    expect(container.textContent).toContain("Enabled");
    expect(container.textContent).toContain("Anyone with this link can request a booking.");

    const copyButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Copy link",
    );
    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Open link",
    );
    expect(copyButton).toBeDefined();
    expect(openButton).toBeDefined();

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(clipboardWrite).toHaveBeenCalledWith(
      "https://example.test/public/bookings/test-workspace",
    );
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.test/public/bookings/test-workspace",
      "_blank",
      "noopener,noreferrer",
    );

    const logCalls = vi.mocked(console.log).mock.calls;
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[settings-booking-link-visible]" &&
          payload.workspaceId === "workspace-1" &&
          payload.workspaceSlug === "test-workspace" &&
          payload.displayUrlText === expectedUrl &&
          payload.hasAbsoluteUrlForActions === true,
      ),
    ).toBe(true);
  });

  it("shows the disabled label and hint when bookings are off", async () => {
    await renderSettings({ slug: "test-workspace", publicLeadEnabled: false });
    await flushReactUpdates();

    expect(container.textContent).toContain("Disabled");
    expect(container.textContent).toContain("This booking link is not active.");
  });
});
