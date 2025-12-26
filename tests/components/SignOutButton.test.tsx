import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockReplace = vi.fn();
const mockSignOut = vi.fn();
const mockCreateClient = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => mockCreateClient(),
}));

import SignOutButton from "@/app/(app)/settings/SignOutButton";

describe("SignOutButton", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockReplace.mockReset();
    mockSignOut.mockReset();
    mockCreateClient.mockReset();
    mockCreateClient.mockReturnValue({
      auth: {
        signOut: (...args: unknown[]) => mockSignOut(...args),
      },
    });
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

  async function renderButton() {
    if (!root) {
      throw new Error("missing root");
    }
    await act(async () => {
      root?.render(<SignOutButton userId="user-1" workspaceId="workspace-1" />);
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

  it("shows a loading state and navigates on success", async () => {
    let resolveSignOut: ((value: { error: null }) => void) | null = null;
    mockSignOut.mockReturnValue(
      new Promise((resolve) => {
        resolveSignOut = resolve;
      }),
    );

    await renderButton();
    await flushReactUpdates();

    const button = findButton("Sign out");
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReactUpdates();

    expect(findButton("Signing out...")).toBeDefined();
    resolveSignOut?.({ error: null });
    await flushReactUpdates();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("renders an error banner when sign-out fails", async () => {
    mockSignOut.mockResolvedValue({ error: { name: "AuthApiError" } });

    await renderButton();
    await flushReactUpdates();

    const button = findButton("Sign out");
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReactUpdates();

    expect(container.textContent).toContain("We couldn't sign you out. Please try again.");
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
