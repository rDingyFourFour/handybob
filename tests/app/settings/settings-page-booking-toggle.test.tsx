import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setupSupabaseMock } from "@/tests/setup/supabaseClientMock";

const createServerClientMock = vi.fn();
const mockGetCurrentWorkspace = vi.fn();
const mockRedirect = vi.fn();
const mockUpdatePublicBookingEnabledAction = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
  useRouter: () => ({
    replace: vi.fn(),
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

vi.mock("@/app/(app)/settings/actions/updatePublicBookingEnabledAction", () => ({
  updatePublicBookingEnabledAction: (...args: unknown[]) =>
    mockUpdatePublicBookingEnabledAction(...args),
}));

import SettingsHomePage from "@/app/(app)/settings/page";

type RenderOptions = {
  publicLeadEnabled?: boolean;
};

describe("Settings bookings toggle", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockRedirect.mockReset();
    createServerClientMock.mockReset();
    mockGetCurrentWorkspace.mockReset();
    mockUpdatePublicBookingEnabledAction.mockReset();
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

  async function renderSettings({ publicLeadEnabled = true }: RenderOptions = {}) {
    const supabaseState = setupSupabaseMock({
      workspaces: {
        data: [
          {
            id: "workspace-1",
            name: "Test workspace",
            owner_id: "user-1",
            slug: "test-workspace",
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
      workspace: { id: "workspace-1", name: "Test workspace", owner_id: "user-1", slug: "test-workspace" },
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

  function findToggleInput() {
    return container.querySelector<HTMLInputElement>('input[type="checkbox"]');
  }

  function findToggleButton() {
    return Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Enable bookings" ||
        button.textContent?.trim() === "Disable bookings",
    );
  }

  it("reflects the initial enabled state", async () => {
    await renderSettings({ publicLeadEnabled: true });
    await flushReactUpdates();

    const toggleInput = findToggleInput();
    expect(toggleInput?.checked).toBe(true);
    expect(container.textContent).toContain("Enabled");
  });

  it("reflects the initial disabled state", async () => {
    await renderSettings({ publicLeadEnabled: false });
    await flushReactUpdates();

    const toggleInputDisabled = findToggleInput();
    expect(toggleInputDisabled?.checked).toBe(false);
    expect(container.textContent).toContain("Disabled");
  });

  it("updates state on success and logs UI telemetry", async () => {
    mockUpdatePublicBookingEnabledAction.mockResolvedValueOnce({
      success: true,
      enabled: false,
    });

    await renderSettings({ publicLeadEnabled: true });
    await flushReactUpdates();

    const toggleButton = findToggleButton();
    expect(toggleButton).toBeDefined();

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReactUpdates();

    expect(container.textContent).toContain("Disabled");

    const logCalls = vi.mocked(console.log).mock.calls;
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[settings-booking-toggle-ui-click]" &&
          payload.intendedEnabled === false,
      ),
    ).toBe(true);
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[settings-booking-toggle-ui-result]" &&
          payload.success === true,
      ),
    ).toBe(true);
  });

  it("disables the toggle while pending and restores on failure", async () => {
    let resolveAction: (value: { success: boolean; enabled?: boolean; code?: string; message?: string }) => void;
    const actionPromise = new Promise((resolve) => {
      resolveAction = resolve;
    });
    mockUpdatePublicBookingEnabledAction.mockReturnValueOnce(actionPromise);

    await renderSettings({ publicLeadEnabled: false });
    await flushReactUpdates();

    const toggleInput = findToggleInput();
    const toggleButton = findToggleButton();

    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await flushReactUpdates(1);

    expect(toggleInput?.disabled).toBe(true);
    expect(container.textContent).toContain("Saving...");

    resolveAction!({
      success: false,
      code: "update_failed",
      message: "We couldn’t update bookings right now.",
    });

    await flushReactUpdates();

    expect(toggleInput?.checked).toBe(false);
    expect(container.textContent).toContain("We couldn’t update bookings right now.");
    const logCalls = vi.mocked(console.log).mock.calls;
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[settings-booking-toggle-ui-result]" &&
          payload.success === false &&
          payload.code === "update_failed",
      ),
    ).toBe(true);
  });
});
