import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import PublicBookingEntryPage from "@/app/public/booking/page";

describe("public booking entry page", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockPush.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
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

  it("renders the canonical URL copy and navigation controls", async () => {
    if (!root) {
      throw new Error("missing root");
    }
    await act(async () => {
      root?.render(<PublicBookingEntryPage />);
    });

    expect(container.textContent).toContain("/public/bookings/{your-workspace-slug}");
    const input = container.querySelector("#booking-slug");
    const button = container.querySelector("button");
    expect(input).not.toBeNull();
    expect(button).not.toBeNull();

    const wrapper = container.querySelector('[data-testid="public-booking-entry"]');
    expect(wrapper?.tagName).toBe("DIV");

    await act(async () => {
      root?.render(<PublicBookingEntryPage />);
    });

    const rerenderedWrapper = container.querySelector('[data-testid="public-booking-entry"]');
    expect(rerenderedWrapper?.tagName).toBe("DIV");
  });

  it("navigates to the public booking URL when submitting a slug", async () => {
    if (!root) {
      throw new Error("missing root");
    }
    await act(async () => {
      root?.render(<PublicBookingEntryPage />);
    });

    const input = container.querySelector("#booking-slug") as HTMLInputElement | null;
    const button = container.querySelector("button") as HTMLButtonElement | null;

    if (!input || !button) {
      throw new Error("missing input or button");
    }

    await act(async () => {
      input.value = " Test-Workspace ";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockPush).toHaveBeenCalledWith("/public/bookings/test-workspace");
  });
});
