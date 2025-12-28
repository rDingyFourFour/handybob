import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BookingLinkCard from "@/app/(app)/settings/BookingLinkCard";

describe("BookingLinkCard", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
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

  async function renderCard(props: {
    displayUrlText: string | null;
    absoluteUrlForActions: string | null;
    isEnabled: boolean;
  }) {
    if (!root) {
      throw new Error("missing root");
    }
    await act(async () => {
      root?.render(
        <BookingLinkCard
          displayUrlText={props.displayUrlText}
          absoluteUrlForActions={props.absoluteUrlForActions}
          isEnabled={props.isEnabled}
          workspaceId="workspace-1"
          workspaceSlug="workspace-slug"
        />,
      );
    });
  }

  function findButton(label: string) {
    return Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === label,
    );
  }

  it("renders the booking url and enabled state actions", async () => {
    await renderCard({
      displayUrlText: "/public/bookings/workspace-slug",
      absoluteUrlForActions: null,
      isEnabled: true,
    });

    const url = container.querySelector('[data-testid="booking-link-url"]');
    expect(url?.textContent).toBe("/public/bookings/workspace-slug");
    expect(findButton("Copy link")).toBeDefined();
    expect(findButton("Open link")).toBeDefined();
  });

  it("copies the link and logs success telemetry", async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: clipboardWrite } });

    await renderCard({
      displayUrlText: "/public/bookings/workspace-slug",
      absoluteUrlForActions: null,
      isEnabled: true,
    });

    const copyButton = findButton("Copy link");
    expect(copyButton).toBeDefined();

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(clipboardWrite).toHaveBeenCalledWith("/public/bookings/workspace-slug");
    const logCalls = vi.mocked(console.log).mock.calls;
    expect(
      logCalls.some(
        ([label]) => label === "[settings-booking-link-copy-click]",
      ),
    ).toBe(true);
    expect(
      logCalls.some(
        ([label]) => label === "[settings-booking-link-copy-success]",
      ),
    ).toBe(true);
  });

  it("renders copy failure feedback and telemetry when clipboard fails", async () => {
    const clipboardWrite = vi.fn().mockRejectedValue(new Error("boom"));
    Object.assign(navigator, { clipboard: { writeText: clipboardWrite } });

    await renderCard({
      displayUrlText: "/public/bookings/workspace-slug",
      absoluteUrlForActions: null,
      isEnabled: true,
    });

    const copyButton = findButton("Copy link");
    expect(copyButton).toBeDefined();

    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(findButton("Copy failed")).toBeDefined();
    const logCalls = vi.mocked(console.log).mock.calls;
    expect(
      logCalls.some(
        ([label, payload]) =>
          label === "[settings-booking-link-copy-failure]" &&
          payload.errorCode === "clipboard_failed",
      ),
    ).toBe(true);
  });

  it("opens the link when enabled and when disabled", async () => {
    const openSpy = vi.fn();
    Object.assign(window, { open: openSpy });

    await renderCard({
      displayUrlText: "/public/bookings/workspace-slug",
      absoluteUrlForActions: null,
      isEnabled: true,
    });

    const openButton = findButton("Open link");
    expect(openButton).toBeDefined();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(openSpy).toHaveBeenCalledWith(
      "/public/bookings/workspace-slug",
      "_blank",
      "noopener,noreferrer",
    );

    await renderCard({
      displayUrlText: "/public/bookings/workspace-slug",
      absoluteUrlForActions: null,
      isEnabled: false,
    });
    const disabledOpenButton = findButton("Open link");
    expect(disabledOpenButton).toBeDefined();

    await act(async () => {
      disabledOpenButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(openSpy).toHaveBeenCalledTimes(2);
  });

  it("renders the display text and uses the absolute url for actions", async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: clipboardWrite } });
    const openSpy = vi.fn();
    Object.assign(window, { open: openSpy });

    await renderCard({
      displayUrlText: "/public/bookings/workspace-3",
      absoluteUrlForActions: "https://example.com/public/bookings/workspace-3",
      isEnabled: true,
    });

    const url = container.querySelector('[data-testid="booking-link-url"]');
    expect(url?.textContent).toBe("/public/bookings/workspace-3");

    const copyButton = findButton("Copy link");
    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(clipboardWrite).toHaveBeenCalledWith(
      "https://example.com/public/bookings/workspace-3",
    );

    const openButton = findButton("Open link");
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/public/bookings/workspace-3",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("does not depend on window.location for rendered text", async () => {
    const originalLocation = Object.getOwnPropertyDescriptor(window, "location");
    Object.defineProperty(window, "location", {
      configurable: true,
      get() {
        throw new Error("location accessed");
      },
    });

    try {
      await renderCard({
        displayUrlText: "/public/bookings/workspace-3",
        absoluteUrlForActions: "https://example.com/public/bookings/workspace-3",
        isEnabled: true,
      });
    } finally {
      if (originalLocation) {
        Object.defineProperty(window, "location", originalLocation);
      }
    }

    const url = container.querySelector('[data-testid="booking-link-url"]');
    expect(url?.textContent).toBe("/public/bookings/workspace-3");
  });
});
