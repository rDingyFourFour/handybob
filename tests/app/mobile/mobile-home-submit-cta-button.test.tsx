import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const useFormStatusMock = vi.hoisted(() =>
  vi.fn(() => ({ pending: false })),
);
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useFormStatus: useFormStatusMock,
  };
});

import MobileHomeSubmitCtaButton from "@/app/m/components/MobileHomeSubmitCtaButton";

describe("MobileHomeSubmitCtaButton", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

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
    vi.restoreAllMocks();
    useFormStatusMock.mockReset();
  });

  it("renders the label when idle", () => {
    useFormStatusMock.mockReturnValue({ pending: false });

    act(() => {
      root?.render(
        <MobileHomeSubmitCtaButton
          label="Move on"
          eventName="[home-recommendation-click]"
          eventPayloadJson="{}"
          dataTestId="mobile-home-primary-cta"
        />,
      );
    });

    const button = container.querySelector(
      '[data-testid="mobile-home-primary-cta"]',
    ) as HTMLButtonElement | null;
    expect(button?.textContent).toBe("Move on");
    expect(button?.hasAttribute("disabled")).toBe(false);
    expect(button?.getAttribute("data-event-payload")).toBe("{}");
  });

  it("shows the pending label and disables while pending", () => {
    useFormStatusMock.mockReturnValue({ pending: true });

    act(() => {
      root?.render(
        <MobileHomeSubmitCtaButton
          label="Move on"
          pendingLabel="Processing..."
          eventName="[home-recommendation-click]"
          eventPayloadJson="{}"
          dataTestId="mobile-home-primary-cta"
        />,
      );
    });

    const button = container.querySelector(
      '[data-testid="mobile-home-primary-cta"]',
    ) as HTMLButtonElement | null;
    expect(button?.textContent).toBe("Processing...");
    expect(button?.hasAttribute("disabled")).toBe(true);
  });
});
