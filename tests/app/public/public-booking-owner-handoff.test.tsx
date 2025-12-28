import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BookingForm } from "@/app/public/bookings/[slug]/BookingForm";
import { PublicBookingConfirmation } from "@/app/public/bookings/[slug]/PublicBookingConfirmation";
import { PUBLIC_BOOKING_HANDOFF_SESSION_KEY } from "@/lib/domain/publicBookingHandoff";

const mockReplace = vi.fn();
const mockSubmitPublicBooking = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    replace: (...args: unknown[]) => mockReplace(...args),
  }),
}));

vi.mock("@/app/public/bookings/[slug]/actions", () => ({
  submitPublicBooking: (...args: unknown[]) => mockSubmitPublicBooking(...args),
}));

describe("public booking owner handoff", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockReplace.mockReset();
    mockSubmitPublicBooking.mockReset();
    window.sessionStorage.clear();
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

  async function renderForm() {
    if (!root) {
      throw new Error("missing root");
    }
    await act(async () => {
      root?.render(<BookingForm workspaceSlug="demo" workspaceName="Demo Co" />);
    });
  }

  async function flushReactUpdates(iterations = 4) {
    await act(async () => {
      await Promise.resolve();
    });
    for (let i = 0; i < iterations; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  function fillRequiredFields() {
    const nameInput = container.querySelector<HTMLInputElement>("#name");
    const emailInput = container.querySelector<HTMLInputElement>("#email");
    const descriptionInput = container.querySelector<HTMLTextAreaElement>("#description");
    if (!nameInput || !emailInput || !descriptionInput) {
      throw new Error("missing required inputs");
    }
    nameInput.value = "Riley Example";
    emailInput.value = "riley@example.com";
    descriptionInput.value = "Need help with a stuck door.";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    emailInput.dispatchEvent(new Event("input", { bubbles: true }));
    descriptionInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function submitForm() {
    const form = container.querySelector("form");
    if (!form) {
      throw new Error("missing form");
    }
    await act(async () => {
      if (typeof (form as HTMLFormElement).requestSubmit === "function") {
        (form as HTMLFormElement).requestSubmit();
      } else {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
    });
  }

  it("renders the owner handoff CTA, logs visibility, and navigates", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockSubmitPublicBooking.mockResolvedValueOnce({
      status: "success",
      success: true,
      workspaceId: "workspace-1",
      jobId: "job-9",
      customerId: "cust-9",
      ownerHandoff: { eligible: true, redirectPath: "/jobs/job-9" },
      reusedExistingBookingJob: false,
    });

    await renderForm();
    fillRequiredFields();
    await submitForm();
    await flushReactUpdates();

    const handoffButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Open in AskBob"),
    );
    expect(handoffButton).toBeTruthy();

    expect(
      logSpy.mock.calls.some(
        ([label, payload]) =>
          label === "[public-booking-owner-handoff-visible]" &&
          payload.workspaceId === "workspace-1" &&
          payload.jobId === "job-9" &&
          payload.customerId === "cust-9" &&
          payload.redirectPath === "/jobs/job-9",
      ),
    ).toBe(true);

    await act(async () => {
      handoffButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const stored = window.sessionStorage.getItem(PUBLIC_BOOKING_HANDOFF_SESSION_KEY);
    expect(stored).toBeTruthy();
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      expect(parsed.jobId).toBe("job-9");
      expect(parsed.source).toBe("public_booking_owner_handoff");
      expect(parsed.desiredStep).toBe(1);
      expect(typeof parsed.createdAt).toBe("number");
    }

    expect(mockReplace).toHaveBeenCalledWith("/jobs/job-9");
    expect(
      logSpy.mock.calls.some(
        ([label, payload]) =>
          label === "[public-booking-owner-handoff-click]" &&
          payload.workspaceId === "workspace-1" &&
          payload.jobId === "job-9" &&
          payload.customerId === "cust-9" &&
          payload.redirectPath === "/jobs/job-9",
      ),
    ).toBe(true);
    expect(
      logSpy.mock.calls.some(
        ([label, payload]) =>
          label === "[public-booking-owner-handoff-askbob-click]" &&
          payload.workspaceId === "workspace-1" &&
          payload.jobId === "job-9" &&
          payload.desiredStep === 1 &&
          payload.hasHandoffSignal === true,
      ),
    ).toBe(true);
    expect(
      logSpy.mock.calls.some(
        ([label, payload]) =>
          label === "[public-booking-owner-handoff-navigate]" &&
          payload.workspaceId === "workspace-1" &&
          payload.jobId === "job-9" &&
          payload.customerId === "cust-9" &&
          payload.redirectPath === "/jobs/job-9",
      ),
    ).toBe(true);
  });

  it("omits the owner CTA when the viewer is not eligible", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockSubmitPublicBooking.mockResolvedValueOnce({
      status: "success",
      success: true,
      workspaceId: "workspace-1",
      jobId: "job-10",
      customerId: "cust-10",
      ownerHandoff: { eligible: false },
      reusedExistingBookingJob: false,
    });

    await renderForm();
    fillRequiredFields();
    await submitForm();
    await flushReactUpdates();

    const handoffButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Open in AskBob"),
    );
    expect(handoffButton).toBeUndefined();
    expect(
      logSpy.mock.calls.some(([label]) => label === "[public-booking-owner-handoff-visible]"),
    ).toBe(false);
  });
});

describe("public booking confirmation hydration guard", () => {
  it("keeps the confirmation wrapper stable between owner and non-owner states", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <PublicBookingConfirmation
          jobId="job-guard"
          customerId="cust-guard"
          ownerHandoff={{ eligible: false }}
          onOwnerHandoff={() => {}}
        />,
      );
    });

    const wrapper = container.querySelector<HTMLElement>(
      "[data-testid=\"public-booking-confirmation\"]",
    );
    const actionsWrapper = container.querySelector<HTMLElement>(
      "[data-testid=\"public-booking-confirmation-actions\"]",
    );
    expect(wrapper).toBeTruthy();
    expect(actionsWrapper).toBeTruthy();
    expect(container.textContent).toContain("Submit another request");

    act(() => {
      root.render(
        <PublicBookingConfirmation
          jobId="job-guard"
          customerId="cust-guard"
          ownerHandoff={{ eligible: true, redirectPath: "/jobs/job-guard" }}
          onOwnerHandoff={() => {}}
        />,
      );
    });

    const wrapperAfter = container.querySelector<HTMLElement>(
      "[data-testid=\"public-booking-confirmation\"]",
    );
    const actionsWrapperAfter = container.querySelector<HTMLElement>(
      "[data-testid=\"public-booking-confirmation-actions\"]",
    );
    expect(wrapperAfter).toBe(wrapper);
    expect(actionsWrapperAfter).toBe(actionsWrapper);
    expect(container.textContent).toContain("Open in AskBob");

    act(() => {
      root.unmount();
    });
  });
});
