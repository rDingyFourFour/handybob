import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAcceptQuoteAction = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/app/(app)/quotes/actions/acceptQuoteAction", () => ({
  acceptQuoteAction: (...args: unknown[]) => mockAcceptQuoteAction(...args),
}));

import QuoteDetailsCard from "@/components/quotes/QuoteDetailsCard";

describe("QuoteDetailsCard accept CTA", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockAcceptQuoteAction.mockReset();
    window.localStorage.setItem("hb_quote_details_collapsed_hint_seen", "true");
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
    window.localStorage.removeItem("hb_quote_details_collapsed_hint_seen");
    vi.restoreAllMocks();
  });

  async function renderCard(props: Partial<React.ComponentProps<typeof QuoteDetailsCard>> = {}) {
    if (!root) {
      throw new Error("missing root");
    }
    await act(async () => {
      root?.render(
        <QuoteDetailsCard
          quoteId="quote-1"
          workspaceId="workspace-1"
          statusLabel="draft"
          createdLabel="Jan 1, 2025"
          updatedLabel="Jan 2, 2025"
          jobTitle="Job 123"
          jobId="job-1"
          {...props}
        />,
      );
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

  it("renders the accept CTA and calls the action", async () => {
    mockAcceptQuoteAction.mockResolvedValue({
      ok: true,
      code: "accepted",
      quoteId: "quote-1",
      jobId: "job-1",
    });

    await renderCard();
    await flushReactUpdates();

    const button = findButton("Accept quote");
    expect(button).toBeDefined();

    const form = button?.closest("form");
    expect(form).not.toBeNull();

    await act(async () => {
      if (form && typeof (form as HTMLFormElement).requestSubmit === "function") {
        (form as HTMLFormElement).requestSubmit(button as HTMLButtonElement);
      } else if (form) {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
    });

    await flushReactUpdates();

    expect(mockAcceptQuoteAction).toHaveBeenCalled();
  });

  it("replaces the CTA with an accepted badge", async () => {
    await renderCard({ isAccepted: true, statusLabel: "accepted" });
    await flushReactUpdates();

    expect(findButton("Accept quote")).toBeUndefined();
    expect(container.innerHTML).toContain("Accepted");
  });
});
